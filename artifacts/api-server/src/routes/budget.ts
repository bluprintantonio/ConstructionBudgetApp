import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { calculatePackTotals } from "@workspace/engine/packs";
import { getSnapshotDriftStatus } from "@workspace/engine/provenance";
import {
  db,
  budgetLinesTable,
  budgetQuotesTable,
  capChaptersTable,
  extrasTable,
  houseTypesTable,
  lineMarkersTable,
  lineChapterOverridesTable,
  plannerInputsTable,
  quoteLinksTable,
  sourcesTable,
} from "@workspace/db";
import {
  CheckBudgetSourceConnectionParams,
  CheckBudgetSourceConnectionResponse,
  CreateBudgetLineBody,
  CreateBudgetLineResponse,
  CreateBudgetQuoteBody,
  CreateBudgetQuoteResponse,
  DeleteBudgetLineParams,
  DeleteBudgetQuoteParams,
  GetBudgetDashboardResponse,
  GetBudgetExtrasResponse,
  GetBudgetLinesResponse,
  GetBudgetProjectsResponse,
  GetBudgetQuoteLinksResponse,
  GetBudgetQuotesResponse,
  GetBudgetSourcesResponse,
  GetCapChaptersResponse,
  GetChapterSeedStatusResponse,
  GetLineChapterOverridesResponse,
  GetPlannerHouseTypesResponse,
  GetPlannerInputsResponse,
  ImportBudgetLinesBody,
  ImportBudgetLinesResponse,
  UpdatePlannerInputsBody,
  UpdatePlannerInputsParams,
  UpdatePlannerInputsResponse,
  UpdatePlannerSalePricesBody,
  UpdatePlannerSalePricesResponse,
  UpdateBudgetLineBody,
  UpdateBudgetLineParams,
  UpdateBudgetLineResponse,
  UpdateBudgetExtraBody,
  UpdateBudgetExtraParams,
  UpdateBudgetExtraResponse,
  UpdateBudgetQuoteLinksBody,
  UpdateBudgetQuoteLinksParams,
  UpdateBudgetQuoteLinksResponse,
  UpdateBudgetQuoteBody,
  UpdateBudgetQuoteParams,
  UpdateBudgetQuoteResponse,
  UpdateBudgetLineMarkerParams,
  UpdateBudgetLineMarkerBody,
  UpdateBudgetLineMarkerResponse,
  DeleteLineChapterOverrideParams,
  UpsertLineChapterOverrideBody,
  UpsertLineChapterOverrideParams,
  UpsertLineChapterOverrideResponse,
} from "@workspace/api-zod";
import {
  buildingTypes,
  sources,
  seedExtras,
} from "../lib/budget-seed";
import { ensureBudgetSeedData as ensureSeedData } from "../lib/budget-data-seed";
import { getChapterSeedStatus } from "../lib/chapter-seed";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

type DriveFileMetadata = {
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
};

type DriveFilesListResponse = {
  files?: DriveFileMetadata[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
};

function driveTypeLabel(mimeType?: string): string {
  const labels: Record<string, string> = {
    "application/vnd.google-apps.folder": "Folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/pdf": "PDF",
    "text/csv": "CSV",
  };
  return mimeType ? (labels[mimeType] ?? mimeType) : "Unknown";
}

async function getDriveJson<T>(path: string): Promise<T> {
  const response = await connectors.proxy("google-drive", path, {
    method: "GET",
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
  } & T;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `Google Drive request failed with HTTP ${response.status}.`,
    );
  }
  return payload;
}

async function readDriveSource(source: typeof sourcesTable.$inferSelect) {
  const metadataQuery = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,mimeType,modifiedTime",
  });
  const metadata = await getDriveJson<DriveFileMetadata>(
    `/drive/v3/files/${encodeURIComponent(source.driveFileId)}?${metadataQuery}`,
  );

  const children: {
    name: string;
    type: string;
    modifiedTime: string | null;
  }[] = [];
  let incompleteSearch = false;

  if (source.type === "folder") {
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        q: `'${source.driveFileId}' in parents and trashed = false`,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        fields: "nextPageToken,incompleteSearch,files(name,mimeType,modifiedTime)",
      });
      if (pageToken) query.set("pageToken", pageToken);

      const page = await getDriveJson<DriveFilesListResponse>(
        `/drive/v3/files?${query}`,
      );
      children.push(
        ...(page.files ?? []).map((file) => ({
          name: file.name ?? "(unnamed)",
          type: driveTypeLabel(file.mimeType),
          modifiedTime: file.modifiedTime ?? null,
        })),
      );
      incompleteSearch ||= Boolean(page.incompleteSearch);
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  return {
    driveModifiedTime: metadata.modifiedTime
      ? new Date(metadata.modifiedTime)
      : null,
    itemCount: source.type === "folder" ? children.length : null,
    children,
    status: incompleteSearch ? "incomplete" : "connected",
    error: incompleteSearch
      ? "Google Drive reported an incomplete folder listing."
      : null,
  };
}

function serializeLine(
  line: typeof budgetLinesTable.$inferSelect,
  sourceUrl: string | null,
  marker: typeof lineMarkersTable.$inferSelect | null,
) {
  return {
    ...line,
    marker: marker?.marker ?? "common",
    markerDecisionReason: marker?.decisionReason ?? null,
    markerDecidedOn: marker?.decidedOn ?? null,
    sourceUrl,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  };
}

async function serializeLines(
  lines: (typeof budgetLinesTable.$inferSelect)[],
) {
  const [sourceRows, markerRows] = await Promise.all([
    db.select({ id: sourcesTable.id, driveUrl: sourcesTable.driveUrl }).from(sourcesTable),
    db.select().from(lineMarkersTable),
  ]);
  const sourceUrls = new Map(
    sourceRows.map((source) => [source.id, source.driveUrl]),
  );
  const markers = new Map(
    markerRows.map((marker) => [marker.budgetLineCode, marker]),
  );

  return lines.map((line) =>
    serializeLine(
      line,
      line.sourceId ? (sourceUrls.get(line.sourceId) ?? null) : null,
      line.code ? (markers.get(line.code) ?? null) : null,
    ),
  );
}

function serializeQuote(quote: typeof budgetQuotesTable.$inferSelect) {
  return {
    ...quote,
    modifiedAt: quote.modifiedAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

function serializeSource(source: typeof sourcesTable.$inferSelect) {
  return {
    id: source.id,
    name: source.name,
    sourceType: source.type === "csv" ? "spreadsheet" : "folder",
    url: source.driveUrl,
    note: source.description,
    snapshotVerifiedOn: source.snapshotVerifiedOn,
    snapshotDriveModifiedTime:
      source.snapshotDriveModifiedTime?.toISOString() ?? null,
    snapshotDriftStatus: source.type === "csv"
      ? getSnapshotDriftStatus({
          snapshotDriveModifiedTime:
            source.snapshotDriveModifiedTime?.toISOString() ?? null,
          driveModifiedTime: source.driveModifiedTime?.toISOString() ?? null,
          lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
        })
      : null,
    driveModifiedTime: source.driveModifiedTime?.toISOString() ?? null,
    lastCheckedAt: source.lastCheckedAt?.toISOString() ?? null,
    status: source.status,
    itemCount: source.itemCount,
    children: source.children,
  };
}

function serializeSourceCheck(
  source: typeof sourcesTable.$inferSelect,
  error: string | null,
) {
  return {
    id: source.id,
    driveModifiedTime: source.driveModifiedTime?.toISOString() ?? null,
    lastCheckedAt: source.lastCheckedAt?.toISOString() ?? new Date().toISOString(),
    status: source.status ?? "error",
    itemCount: source.itemCount,
    children: source.children,
    error,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function lineValues(
  data: typeof CreateBudgetLineBody._type,
): typeof budgetLinesTable.$inferInsert {
  return {
    id: data.code ? `material-${data.code.replaceAll(".", "-")}` : newId(),
    category: data.category,
    item: data.item,
    buildingType: data.buildingType ?? null,
    vendor: data.vendor ?? null,
    receitas: data.receitas ?? null,
    balanco: data.balanco ?? null,
    investimento: data.investimento ?? null,
    despesas: data.despesas ?? null,
    quoteAmount: data.quoteAmount ?? null,
    status: data.status,
    reviewStatus: data.reviewStatus,
    sourceRow: data.sourceRow ?? null,
    sourceNote: data.sourceNote ?? null,
    sourceId: null,
    origin: "manual",
    priceBasis: null,
    code: data.code ?? null,
    unit: data.unit ?? null,
    quantity: data.quantity ?? null,
    standardUnitPrice: data.standardUnitPrice ?? null,
    standardTotal: data.standardTotal ?? null,
    ecoUnitPrice: data.ecoUnitPrice ?? null,
    ecoTotal: data.ecoTotal ?? null,
    premiumUnitPrice: data.premiumUnitPrice ?? null,
    premiumTotal: data.premiumTotal ?? null,
  };
}

function quoteValues(
  data: typeof CreateBudgetQuoteBody._type,
): typeof budgetQuotesTable.$inferInsert {
  return {
    id: newId(),
    fileName: data.fileName,
    category: data.category,
    vendor: data.vendor ?? null,
    documentType: data.documentType,
    status: data.status,
    amount: data.amount ?? null,
    priceScope: data.priceScope ?? "per house unit",
    scopeType: data.scopeType ?? "unknown",
    vatIncluded: data.vatIncluded ?? "unknown",
    validityDate: data.validityDate ?? null,
    driveUrl: data.driveUrl ?? null,
    buildingType: data.buildingType ?? null,
    modifiedAt: data.modifiedAt ? new Date(data.modifiedAt) : null,
    sourceUrl: data.sourceUrl,
    sourceFolderUrl: data.sourceFolderUrl ?? null,
    note: data.note ?? null,
  };
}

router.get("/budget/dashboard", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [lines, extras, quotes, markerRows] = await Promise.all([
    db.select().from(budgetLinesTable),
    db.select().from(extrasTable),
    db.select().from(budgetQuotesTable),
    db.select().from(lineMarkersTable),
  ]);
  const markers = new Map(
    markerRows.map((marker) => [marker.budgetLineCode, marker.marker]),
  );
  const packs = calculatePackTotals(
    lines.map((line) => ({
      ...line,
      marker: line.code ? (markers.get(line.code) ?? "common") : "common",
    })),
    extras,
  );
  res.json(
    GetBudgetDashboardResponse.parse({
      sourceMetrics: [
        {
          id: "eco",
          label: "Eco",
          value: packs.eco.total,
          sourceColumn: "Standard unit price + extras",
          fromCsvLines: packs.eco.fromCsvLines,
          fromCommonLines: null,
          fromPremiumRatedLines: null,
          notApplicableLineCount: null,
          notApplicableStandardValue: null,
          fromExtras: packs.eco.fromExtras,
          pendingExtraCount: packs.eco.pendingExtraCount,
        },
        {
          id: "standard",
          label: "Standard",
          value: packs.standard.total,
          sourceColumn: "Standard unit price",
          fromCsvLines: packs.standard.fromCsvLines,
          fromCommonLines: null,
          fromPremiumRatedLines: null,
          notApplicableLineCount: null,
          notApplicableStandardValue: null,
          fromExtras: packs.standard.fromExtras,
          pendingExtraCount: packs.standard.pendingExtraCount,
        },
        {
          id: "premium",
          label: "Premium",
          value: packs.premium.total,
          sourceColumn: "Premium price markers + extras",
          fromCsvLines: packs.premium.fromCsvLines,
          fromCommonLines: packs.premium.fromCommonLines,
          fromPremiumRatedLines: packs.premium.fromPremiumRatedLines,
          notApplicableLineCount: packs.premium.notApplicableLineCount,
          notApplicableStandardValue:
            packs.premium.notApplicableStandardValue,
          fromExtras: packs.premium.fromExtras,
          pendingExtraCount: packs.premium.pendingExtraCount,
        },
      ],
      lineCount: lines.length,
      quoteCount: quotes.length,
      linesNeedingReview: lines.filter((line) => line.reviewStatus === "unreviewed")
        .length,
      quotesNeedingReview: quotes.filter((quote) => quote.status === "needs_review")
        .length,
    }),
  );
});

router.get("/budget/planner-inputs", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(plannerInputsTable)
    .where(isNotNull(plannerInputsTable.houseTypeId))
    .orderBy(asc(plannerInputsTable.houseTypeId));
  res.json(GetPlannerInputsResponse.parse(rows.map((row) => ({
    houseTypeId: row.houseTypeId!,
    landNote: row.landNote,
    grossArea: row.grossArea,
    land: row.land,
    designLicensing: row.designLicensing,
    managementPercent: row.managementPercent,
    contingencyPercent: row.contingencyPercent,
    targetNetMarginPercent: row.targetNetMarginPercent,
    salesCommissionPercent: row.salesCommissionPercent,
    taxesPercent: row.taxesPercent,
    standardReferenceSellingPrice: row.standardReferenceSellingPrice,
    ecoReferenceSellingPrice: row.ecoReferenceSellingPrice,
    premiumReferenceSellingPrice: row.premiumReferenceSellingPrice,
    priceNoteStandard: row.priceNoteStandard,
    priceNoteEco: row.priceNoteEco,
    priceNotePremium: row.priceNotePremium,
  }))));
});

router.get("/budget/house-types", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(houseTypesTable)
    .orderBy(asc(houseTypesTable.sortOrder), asc(houseTypesTable.name));
  res.json(GetPlannerHouseTypesResponse.parse(rows));
});

router.put(
  "/budget/planner-inputs/:houseTypeId",
  async (req, res): Promise<void> => {
  const parsedParams = UpdatePlannerInputsParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const parsed = UpdatePlannerInputsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [houseType] = await db
    .select({ id: houseTypesTable.id })
    .from(houseTypesTable)
    .where(eq(houseTypesTable.id, parsedParams.data.houseTypeId))
    .limit(1);
  if (!houseType) {
    res.status(404).json({ error: "House type not found" });
    return;
  }
  const [row] = await db
    .insert(plannerInputsTable)
    .values({
      id: parsedParams.data.houseTypeId,
      houseTypeId: parsedParams.data.houseTypeId,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: plannerInputsTable.id,
      set: parsed.data,
    })
    .returning();
  res.json(
    UpdatePlannerInputsResponse.parse({
      houseTypeId: row.houseTypeId,
      landNote: row.landNote,
      grossArea: row.grossArea,
      land: row.land,
      designLicensing: row.designLicensing,
      managementPercent: row.managementPercent,
      contingencyPercent: row.contingencyPercent,
      targetNetMarginPercent: row.targetNetMarginPercent,
      salesCommissionPercent: row.salesCommissionPercent,
      taxesPercent: row.taxesPercent,
      standardReferenceSellingPrice: row.standardReferenceSellingPrice,
      ecoReferenceSellingPrice: row.ecoReferenceSellingPrice,
      premiumReferenceSellingPrice: row.premiumReferenceSellingPrice,
      priceNoteStandard: row.priceNoteStandard,
      priceNoteEco: row.priceNoteEco,
      priceNotePremium: row.priceNotePremium,
    }),
  );
  },
);

router.put("/budget/planner-sale-prices", async (req, res): Promise<void> => {
  const parsed = UpdatePlannerSalePricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = parsed.data.rows;
  const houseTypeIds = rows.map((row) => row.houseTypeId);
  if (new Set(houseTypeIds).size !== houseTypeIds.length) {
    res.status(400).json({ error: "Each house type can appear only once." });
    return;
  }
  if (rows.length === 0) {
    res.json(UpdatePlannerSalePricesResponse.parse([]));
    return;
  }

  const knownHouseTypes = await db
    .select({ id: houseTypesTable.id })
    .from(houseTypesTable)
    .where(inArray(houseTypesTable.id, houseTypeIds));
  if (knownHouseTypes.length !== houseTypeIds.length) {
    res.status(404).json({ error: "House type not found" });
    return;
  }

  const savedRows = await db.transaction(async (tx) => {
    const saved = [];
    for (const row of rows) {
      const [savedRow] = await tx
        .insert(plannerInputsTable)
        .values({
          id: row.houseTypeId,
          houseTypeId: row.houseTypeId,
          standardReferenceSellingPrice: row.standardReferenceSellingPrice,
          ecoReferenceSellingPrice: row.ecoReferenceSellingPrice,
          premiumReferenceSellingPrice: row.premiumReferenceSellingPrice,
          priceNoteStandard: row.priceNoteStandard,
          priceNoteEco: row.priceNoteEco,
          priceNotePremium: row.priceNotePremium,
        })
        .onConflictDoUpdate({
          target: plannerInputsTable.id,
          set: {
            standardReferenceSellingPrice: row.standardReferenceSellingPrice,
            ecoReferenceSellingPrice: row.ecoReferenceSellingPrice,
            premiumReferenceSellingPrice: row.premiumReferenceSellingPrice,
            priceNoteStandard: row.priceNoteStandard,
            priceNoteEco: row.priceNoteEco,
            priceNotePremium: row.priceNotePremium,
          },
        })
        .returning();
      saved.push({
        houseTypeId: savedRow.houseTypeId!,
        standardReferenceSellingPrice: savedRow.standardReferenceSellingPrice,
        ecoReferenceSellingPrice: savedRow.ecoReferenceSellingPrice,
        premiumReferenceSellingPrice: savedRow.premiumReferenceSellingPrice,
        priceNoteStandard: savedRow.priceNoteStandard,
        priceNoteEco: savedRow.priceNoteEco,
        priceNotePremium: savedRow.priceNotePremium,
      });
    }
    return saved;
  });

  res.json(UpdatePlannerSalePricesResponse.parse(savedRows));
});

router.get("/budget/projects", async (_req, res): Promise<void> => {
  res.json(GetBudgetProjectsResponse.parse(buildingTypes));
});

router.get("/budget/sources", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const sourceRows = await db.select().from(sourcesTable);
  const sourceOrder = new Map<string, number>(
    sources.map((source, index) => [source.id, index]),
  );
  sourceRows.sort(
    (first, second) =>
      (sourceOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
      (sourceOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER),
  );
  res.json(GetBudgetSourcesResponse.parse(sourceRows.map(serializeSource)));
});

router.post(
  "/budget/sources/:sourceId/check",
  async (req, res): Promise<void> => {
    const params = CheckBudgetSourceConnectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [source] = await db
      .select()
      .from(sourcesTable)
      .where(eq(sourcesTable.id, params.data.sourceId))
      .limit(1);
    if (!source) {
      res.status(404).json({ error: "Source not found." });
      return;
    }

    const checkedAt = new Date();
    try {
      const driveResult = await readDriveSource(source);
      const [updated] = await db
        .update(sourcesTable)
        .set({
          driveModifiedTime: driveResult.driveModifiedTime,
          lastCheckedAt: checkedAt,
          status: driveResult.status,
          itemCount: driveResult.itemCount,
          children: driveResult.children,
        })
        .where(eq(sourcesTable.id, source.id))
        .returning();
      res.json(
        CheckBudgetSourceConnectionResponse.parse(
          serializeSourceCheck(updated, driveResult.error),
        ),
      );
    } catch (error) {
      const [updated] = await db
        .update(sourcesTable)
        .set({ lastCheckedAt: checkedAt, status: "error" })
        .where(eq(sourcesTable.id, source.id))
        .returning();
      const message =
        error instanceof Error
          ? error.message
          : "Google Drive access failed.";
      res.json(
        CheckBudgetSourceConnectionResponse.parse(
          serializeSourceCheck(updated, message),
        ),
      );
    }
  },
);

router.get("/budget/chapter-seed-status", (_req, res): void => {
  res.json(GetChapterSeedStatusResponse.parse(getChapterSeedStatus()));
});

router.get("/budget/cap-chapters", async (_req, res): Promise<void> => {
  const chapters = await db
    .select()
    .from(capChaptersTable)
    .orderBy(asc(capChaptersTable.sortOrder));
  res.json(GetCapChaptersResponse.parse(chapters));
});

router.get(
  "/budget/line-chapter-overrides",
  async (_req, res): Promise<void> => {
    const overrides = await db
      .select()
      .from(lineChapterOverridesTable)
      .orderBy(asc(lineChapterOverridesTable.budgetLineCode));
    res.json(
      GetLineChapterOverridesResponse.parse(
        overrides.map((override) => ({
          ...override,
          createdAt: override.createdAt.toISOString(),
        })),
      ),
    );
  },
);

router.put(
  "/budget/line-chapter-overrides/:budgetLineCode",
  async (req, res): Promise<void> => {
    const params = UpsertLineChapterOverrideParams.safeParse(req.params);
    const parsed = UpsertLineChapterOverrideBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success || !parsed.data.reason.trim()) {
      res.status(400).json({
        error: parsed.success
          ? "A reason is required for a chapter override."
          : parsed.error.message,
      });
      return;
    }

    const [line] = await db
      .select({ code: budgetLinesTable.code })
      .from(budgetLinesTable)
      .where(eq(budgetLinesTable.code, params.data.budgetLineCode))
      .limit(1);
    if (!line) {
      res.status(404).json({ error: "Budget line not found." });
      return;
    }

    const [chapter] = await db
      .select({ code: capChaptersTable.code })
      .from(capChaptersTable)
      .where(eq(capChaptersTable.code, parsed.data.chapterCode))
      .limit(1);
    if (!chapter) {
      res.status(404).json({ error: "CAP chapter not found." });
      return;
    }

    const [override] = await db
      .insert(lineChapterOverridesTable)
      .values({
        budgetLineCode: params.data.budgetLineCode,
        chapterCode: parsed.data.chapterCode,
        reason: parsed.data.reason.trim(),
        decidedOn: parsed.data.decidedOn,
      })
      .onConflictDoUpdate({
        target: lineChapterOverridesTable.budgetLineCode,
        set: {
          chapterCode: parsed.data.chapterCode,
          reason: parsed.data.reason.trim(),
          decidedOn: parsed.data.decidedOn,
        },
      })
      .returning();

    res.json(
      UpsertLineChapterOverrideResponse.parse({
        ...override,
        createdAt: override.createdAt.toISOString(),
      }),
    );
  },
);

router.delete(
  "/budget/line-chapter-overrides/:budgetLineCode",
  async (req, res): Promise<void> => {
    const params = DeleteLineChapterOverrideParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(lineChapterOverridesTable)
      .where(
        eq(
          lineChapterOverridesTable.budgetLineCode,
          params.data.budgetLineCode,
        ),
      );
    res.sendStatus(204);
  },
);

router.get("/budget/lines", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const lines = await db
    .select()
    .from(budgetLinesTable)
    .orderBy(asc(budgetLinesTable.category), asc(budgetLinesTable.item));
  res.json(GetBudgetLinesResponse.parse(await serializeLines(lines)));
});

router.patch(
  "/budget/line-markers/:budgetLineCode",
  async (req, res): Promise<void> => {
    await ensureSeedData();
    const params = UpdateBudgetLineMarkerParams.safeParse(req.params);
    const parsed = UpdateBudgetLineMarkerBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success || !parsed.data.decisionReason.trim()) {
      res.status(400).json({
        error: parsed.success
          ? "A reason is required for a marker decision."
          : parsed.error.message,
      });
      return;
    }
    const [line] = await db
      .select({ code: budgetLinesTable.code })
      .from(budgetLinesTable)
      .where(eq(budgetLinesTable.code, params.data.budgetLineCode))
      .limit(1);
    if (!line) {
      res.status(404).json({ error: "Budget line not found." });
      return;
    }
    const [marker] = await db
      .insert(lineMarkersTable)
      .values({
        budgetLineCode: params.data.budgetLineCode,
        marker: parsed.data.marker,
        decisionReason: parsed.data.decisionReason.trim(),
        decidedOn: parsed.data.decidedOn,
      })
      .onConflictDoUpdate({
        target: lineMarkersTable.budgetLineCode,
        set: {
          marker: parsed.data.marker,
          decisionReason: parsed.data.decisionReason.trim(),
          decidedOn: parsed.data.decidedOn,
        },
      })
      .returning();
    res.json(UpdateBudgetLineMarkerResponse.parse(marker));
  },
);

router.get("/budget/extras", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const extras = await db.select().from(extrasTable);
  const order = new Map(seedExtras.map((extra, index) => [extra.id, index]));
  extras.sort(
    (first, second) =>
      (order.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(second.id) ?? Number.MAX_SAFE_INTEGER),
  );
  res.json(GetBudgetExtrasResponse.parse(extras));
});

router.patch(
  "/budget/extras/:extraId",
  async (req, res): Promise<void> => {
    await ensureSeedData();
    const params = UpdateBudgetExtraParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateBudgetExtraBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (parsed.data.quoteId != null) {
      const [linkedQuote] = await db
        .select({ amount: budgetQuotesTable.amount })
        .from(quoteLinksTable)
        .innerJoin(
          budgetQuotesTable,
          eq(quoteLinksTable.quoteId, budgetQuotesTable.id),
        )
        .where(
          and(
            eq(quoteLinksTable.quoteId, parsed.data.quoteId),
            eq(quoteLinksTable.extraId, params.data.extraId),
          ),
        )
        .limit(1);
      if (
        !linkedQuote ||
        linkedQuote.amount == null ||
        parsed.data.unitPrice !== linkedQuote.amount ||
        parsed.data.priceStatus !== "quoted"
      ) {
        res.status(400).json({
          error: "Use a linked quote with an entered amount to set this extra price.",
        });
        return;
      }
    }

    const [updated] = await db
      .update(extrasTable)
      .set(parsed.data)
      .where(eq(extrasTable.id, params.data.extraId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Pack extra not found." });
      return;
    }
    res.json(UpdateBudgetExtraResponse.parse(updated));
  },
);

router.post("/budget/lines", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = CreateBudgetLineBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid budget line input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const values = lineValues(parsed.data);
  if (values.code) {
    const [existing] = await db
      .select({ id: budgetLinesTable.id })
      .from(budgetLinesTable)
      .where(eq(budgetLinesTable.code, values.code))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: `Material code "${values.code}" already exists.` });
      return;
    }
  }
  const [line] = await db
    .insert(budgetLinesTable)
    .values(values)
    .returning();
  const [serializedLine] = await serializeLines([line]);
  res.status(201).json(CreateBudgetLineResponse.parse(serializedLine));
});

router.post("/budget/lines/import", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = ImportBudgetLinesBody.safeParse(req.body);
  if (!parsed.success || parsed.data.length === 0) {
    res.status(400).json({
      error: parsed.success
        ? "Import at least one budget line."
        : parsed.error.message,
    });
    return;
  }
  const lines = await db.transaction(async (tx) => {
    const saved = [];
    for (const item of parsed.data) {
      const values = lineValues(item);
      const [line] = await tx
        .insert(budgetLinesTable)
        .values(values)
        .onConflictDoUpdate({
          target: budgetLinesTable.id,
          set: { ...values, updatedAt: new Date() },
        })
        .returning();
      saved.push(line);
    }
    return saved;
  });
  res
    .status(201)
    .json(ImportBudgetLinesResponse.parse(await serializeLines(lines)));
});

router.patch("/budget/lines/:lineId", async (req, res): Promise<void> => {
  await ensureSeedData();
  const params = UpdateBudgetLineParams.safeParse(req.params);
  const parsed = UpdateBudgetLineBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
    });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  const [line] = await db
    .update(budgetLinesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(budgetLinesTable.id, params.data.lineId))
    .returning();
  if (!line) {
    res.status(404).json({ error: "Budget line not found." });
    return;
  }
  const [serializedLine] = await serializeLines([line]);
  res.json(UpdateBudgetLineResponse.parse(serializedLine));
});

router.delete("/budget/lines/:lineId", async (req, res): Promise<void> => {
  await ensureSeedData();
  const params = DeleteBudgetLineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [line] = await db
    .delete(budgetLinesTable)
    .where(eq(budgetLinesTable.id, params.data.lineId))
    .returning({ id: budgetLinesTable.id });
  if (!line) {
    res.status(404).json({ error: "Budget line not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/budget/quotes", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const quotes = await db
    .select()
    .from(budgetQuotesTable)
    .orderBy(asc(budgetQuotesTable.category), asc(budgetQuotesTable.fileName));
  res.json(GetBudgetQuotesResponse.parse(quotes.map(serializeQuote)));
});

router.get("/budget/quote-links", async (_req, res): Promise<void> => {
  const links = await db
    .select()
    .from(quoteLinksTable)
    .orderBy(asc(quoteLinksTable.quoteId), asc(quoteLinksTable.id));
  res.json(GetBudgetQuoteLinksResponse.parse(links));
});

router.put(
  "/budget/quotes/:quoteId/links",
  async (req, res): Promise<void> => {
    const params = UpdateBudgetQuoteLinksParams.safeParse(req.params);
    const parsed = UpdateBudgetQuoteLinksBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [quote] = await db
      .select({ id: budgetQuotesTable.id })
      .from(budgetQuotesTable)
      .where(eq(budgetQuotesTable.id, params.data.quoteId))
      .limit(1);
    if (!quote) {
      res.status(404).json({ error: "Quote not found." });
      return;
    }

    const invalidTarget = parsed.data.links.some(
      (link) =>
        (link.budgetLineCode !== null) === (link.extraId !== null) ||
        (link.budgetLineCode !== null && link.budgetLineCode.trim() === "") ||
        (link.extraId !== null && link.extraId.trim() === ""),
    );
    if (invalidTarget) {
      res.status(400).json({
        error: "Each quote link must target exactly one budget line or extra.",
      });
      return;
    }

    const lineCodes = parsed.data.links
      .map((link) => link.budgetLineCode)
      .filter((code): code is string => code !== null);
    const extraIds = parsed.data.links
      .map((link) => link.extraId)
      .filter((id): id is string => id !== null);
    const [existingLines, existingExtras] = await Promise.all([
      lineCodes.length
        ? db
            .select({ code: budgetLinesTable.code })
            .from(budgetLinesTable)
            .where(inArray(budgetLinesTable.code, lineCodes))
        : Promise.resolve([]),
      extraIds.length
        ? db
            .select({ id: extrasTable.id })
            .from(extrasTable)
            .where(inArray(extrasTable.id, extraIds))
        : Promise.resolve([]),
    ]);
    const knownLineCodes = new Set(existingLines.map((line) => line.code));
    const knownExtraIds = new Set(existingExtras.map((extra) => extra.id));
    if (
      lineCodes.some((code) => !knownLineCodes.has(code)) ||
      extraIds.some((id) => !knownExtraIds.has(id))
    ) {
      res.status(400).json({
        error: "A linked budget line code or extra does not exist.",
      });
      return;
    }

    const duplicateTargets = new Set<string>();
    for (const link of parsed.data.links) {
      const key =
        link.budgetLineCode !== null
          ? `line:${link.budgetLineCode}`
          : `extra:${link.extraId}`;
      if (duplicateTargets.has(key)) {
        res.status(400).json({ error: "Duplicate quote link target." });
        return;
      }
      duplicateTargets.add(key);
    }

    const links = await db.transaction(async (tx) => {
      await tx
        .delete(quoteLinksTable)
        .where(eq(quoteLinksTable.quoteId, params.data.quoteId));
      if (parsed.data.links.length > 0) {
        await tx.insert(quoteLinksTable).values(
          parsed.data.links.map((link) => ({
            id: newId(),
            quoteId: params.data.quoteId,
            budgetLineCode: link.budgetLineCode,
            extraId: link.extraId,
          })),
        );
      }
      return tx
        .select()
        .from(quoteLinksTable)
        .where(eq(quoteLinksTable.quoteId, params.data.quoteId))
        .orderBy(asc(quoteLinksTable.id));
    });
    res.json(UpdateBudgetQuoteLinksResponse.parse(links));
  },
);

router.post("/budget/quotes", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = CreateBudgetQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid quote input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [quote] = await db
    .insert(budgetQuotesTable)
    .values(quoteValues(parsed.data))
    .returning();
  res.status(201).json(CreateBudgetQuoteResponse.parse(serializeQuote(quote)));
});

router.patch("/budget/quotes/:quoteId", async (req, res): Promise<void> => {
  await ensureSeedData();
  const params = UpdateBudgetQuoteParams.safeParse(req.params);
  const parsed = UpdateBudgetQuoteBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
    });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  const { modifiedAt, ...fields } = parsed.data;
  const values = {
    ...fields,
    ...(modifiedAt !== undefined
      ? {
          modifiedAt:
            modifiedAt === null
              ? null
              : new Date(modifiedAt),
        }
      : {}),
    updatedAt: new Date(),
  };
  const [quote] = await db
    .update(budgetQuotesTable)
    .set(values)
    .where(eq(budgetQuotesTable.id, params.data.quoteId))
    .returning();
  if (!quote) {
    res.status(404).json({ error: "Quote not found." });
    return;
  }
  res.json(UpdateBudgetQuoteResponse.parse(serializeQuote(quote)));
});

router.delete("/budget/quotes/:quoteId", async (req, res): Promise<void> => {
  await ensureSeedData();
  const params = DeleteBudgetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [quote] = await db
    .delete(budgetQuotesTable)
    .where(eq(budgetQuotesTable.id, params.data.quoteId))
    .returning({ id: budgetQuotesTable.id });
  if (!quote) {
    res.status(404).json({ error: "Quote not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
