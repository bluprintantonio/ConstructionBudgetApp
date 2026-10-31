import { Router, type IRouter } from "express";
import { asc, eq, isNotNull, like } from "drizzle-orm";
import {
  db,
  budgetLinesTable,
  budgetMetaTable,
  budgetQuotesTable,
  sourcesTable,
} from "@workspace/db";
import {
  CreateBudgetLineBody,
  CreateBudgetLineResponse,
  CreateBudgetQuoteBody,
  CreateBudgetQuoteResponse,
  DeleteBudgetLineParams,
  DeleteBudgetQuoteParams,
  GetBudgetDashboardResponse,
  GetBudgetLinesResponse,
  GetBudgetProjectsResponse,
  GetBudgetQuotesResponse,
  GetBudgetSourcesResponse,
  ImportBudgetLinesBody,
  ImportBudgetLinesResponse,
  UpdateBudgetLineBody,
  UpdateBudgetLineParams,
  UpdateBudgetLineResponse,
  UpdateBudgetQuoteBody,
  UpdateBudgetQuoteParams,
  UpdateBudgetQuoteResponse,
} from "@workspace/api-zod";
import {
  buildingTypes,
  seedMaterials,
  seedQuotes,
  sourceSeedRows,
  sources,
  toQuoteRow,
} from "../lib/budget-seed";

const router: IRouter = Router();
let seedPromise: Promise<void> | undefined;

async function ensureSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [sourcesSeedMarker] = await db
        .select({ id: budgetMetaTable.id })
        .from(budgetMetaTable)
        .where(eq(budgetMetaTable.id, "sources-v1"))
        .limit(1);
      if (!sourcesSeedMarker) {
        await db.transaction(async (tx) => {
          await tx
            .insert(sourcesTable)
            .values(sourceSeedRows)
            .onConflictDoNothing();
          await tx
            .insert(budgetMetaTable)
            .values({ id: "sources-v1" })
            .onConflictDoNothing();
        });
      }

      const [quoteSeedMarker] = await db
        .select({ id: budgetMetaTable.id })
        .from(budgetMetaTable)
        .where(eq(budgetMetaTable.id, "boxes-quotes-v1"))
        .limit(1);
      if (!quoteSeedMarker) {
        await db.transaction(async (tx) => {
          await tx
            .insert(budgetQuotesTable)
            .values(seedQuotes.map(toQuoteRow))
            .onConflictDoNothing();
          await tx
            .insert(budgetMetaTable)
            .values({ id: "boxes-quotes-v1" })
            .onConflictDoNothing();
        });
      }

      const [materialsSeedMarker] = await db
        .select({ id: budgetMetaTable.id })
        .from(budgetMetaTable)
        .where(eq(budgetMetaTable.id, "materials-map-v1"))
        .limit(1);
      if (!materialsSeedMarker) {
        await db.transaction(async (tx) => {
          await tx
            .delete(budgetLinesTable)
            .where(like(budgetLinesTable.id, "src-%"));
          await tx
            .insert(budgetLinesTable)
            .values(seedMaterials)
            .onConflictDoNothing();
          await tx
            .insert(budgetMetaTable)
            .values({ id: "materials-map-v1" })
            .onConflictDoNothing();
        });
      }

      const [provenanceSeedMarker] = await db
        .select({ id: budgetMetaTable.id })
        .from(budgetMetaTable)
        .where(eq(budgetMetaTable.id, "budget-line-provenance-v1"))
        .limit(1);
      if (!provenanceSeedMarker) {
        await db.transaction(async (tx) => {
          await tx
            .update(budgetLinesTable)
            .set({ sourceId: "materials-master", origin: "imported" })
            .where(isNotNull(budgetLinesTable.sourceRow));
          await tx
            .insert(budgetMetaTable)
            .values({ id: "budget-line-provenance-v1" })
            .onConflictDoNothing();
        });
      }
    })();
  }
  await seedPromise;
}

function serializeLine(
  line: typeof budgetLinesTable.$inferSelect,
  sourceUrl: string | null,
) {
  return {
    ...line,
    sourceUrl,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  };
}

async function serializeLines(
  lines: (typeof budgetLinesTable.$inferSelect)[],
) {
  const sourceRows = await db
    .select({ id: sourcesTable.id, driveUrl: sourcesTable.driveUrl })
    .from(sourcesTable);
  const sourceUrls = new Map(
    sourceRows.map((source) => [source.id, source.driveUrl]),
  );

  return lines.map((line) =>
    serializeLine(
      line,
      line.sourceId ? (sourceUrls.get(line.sourceId) ?? null) : null,
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
    buildingType: data.buildingType ?? null,
    modifiedAt: data.modifiedAt ? new Date(data.modifiedAt) : null,
    sourceUrl: data.sourceUrl,
    sourceFolderUrl: data.sourceFolderUrl ?? null,
    note: data.note ?? null,
  };
}

router.get("/budget/dashboard", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [lines, quotes] = await Promise.all([
    db.select().from(budgetLinesTable),
    db.select().from(budgetQuotesTable),
  ]);
  const sum = (
    field: "ecoTotal" | "standardTotal" | "premiumTotal",
  ) => lines.reduce((total, line) => total + (line[field] ?? 0), 0);
  res.json(
    GetBudgetDashboardResponse.parse({
      sourceMetrics: [
        { id: "eco", label: "Eco", value: sum("ecoTotal"), sourceColumn: "Total Eco" },
        {
          id: "standard",
          label: "Standard",
          value: sum("standardTotal"),
          sourceColumn: "Total Std",
        },
        {
          id: "premium",
          label: "Premium",
          value: sum("premiumTotal"),
          sourceColumn: "Total Premium",
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

router.get("/budget/projects", async (_req, res): Promise<void> => {
  res.json(GetBudgetProjectsResponse.parse(buildingTypes));
});

router.get("/budget/sources", async (_req, res): Promise<void> => {
  res.json(GetBudgetSourcesResponse.parse(sources));
});

router.get("/budget/lines", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const lines = await db
    .select()
    .from(budgetLinesTable)
    .orderBy(asc(budgetLinesTable.category), asc(budgetLinesTable.item));
  res.json(GetBudgetLinesResponse.parse(await serializeLines(lines)));
});

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
