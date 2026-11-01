import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  budgetLinesTable,
  budgetMetaTable,
  budgetQuotesTable,
  db,
  extrasTable,
  houseTypesTable,
  lineChapterOverridesTable,
  lineMarkersTable,
  capChaptersTable,
  sourcesTable,
} from "@workspace/db";
import {
  initialLineMarkerAssignments,
  lineMarkerSeedRows,
  plannerHouseTypeSeedRows,
  seedExtras,
  seedMaterials,
  seedQuotes,
  sourceSeedRows,
  toQuoteRow,
} from "./budget-seed";

type SeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedOnce(
  database: typeof db,
  markerId: string,
  seed: (tx: SeedTransaction) => Promise<void>,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(budgetMetaTable)
      .values({ id: markerId })
      .onConflictDoNothing()
      .returning({ id: budgetMetaTable.id });
    if (claimed) await seed(tx);
  });
}

export async function runBudgetSeedPass(database: typeof db = db): Promise<void> {
  await seedOnce(database, "sources-v1", async (tx) => {
    await tx.insert(sourcesTable).values(sourceSeedRows).onConflictDoNothing();
  });

  await seedOnce(database, "boxes-quotes-v1", async (tx) => {
    await tx
      .insert(budgetQuotesTable)
      .values(seedQuotes.map(toQuoteRow))
      .onConflictDoNothing();
  });

  await seedOnce(database, "materials-map-v1", async (tx) => {
    const existingCodes = new Set(
      (await tx
        .select({ code: budgetLinesTable.code })
        .from(budgetLinesTable)
        .where(isNotNull(budgetLinesTable.code)))
        .map((line) => line.code),
    );
    const missingRows = seedMaterials.filter((line) => !existingCodes.has(line.code));
    if (missingRows.length > 0) {
      await tx.insert(budgetLinesTable).values(missingRows).onConflictDoNothing();
    }
  });

  await seedOnce(database, "budget-line-provenance-v1", async (tx) => {
    await tx
      .update(budgetLinesTable)
      .set({ sourceId: "materials-master" })
      .where(
        and(
          isNotNull(budgetLinesTable.sourceRow),
          isNull(budgetLinesTable.sourceId),
        ),
      );
    await tx
      .update(budgetLinesTable)
      .set({ origin: "imported" })
      .where(
        and(
          isNotNull(budgetLinesTable.sourceRow),
          isNull(budgetLinesTable.origin),
        ),
      );
  });

  await seedOnce(database, "line-markers-v1", async (tx) => {
    await tx.insert(lineMarkersTable).values(lineMarkerSeedRows).onConflictDoNothing();
  });

  await seedOnce(database, "line-markers-not-applicable-v1", async (tx) => {
    await tx
      .insert(lineMarkersTable)
      .values(initialLineMarkerAssignments)
      .onConflictDoNothing();
  });

  await seedOnce(database, "pack-extras-v1", async (tx) => {
    await tx.insert(extrasTable).values(seedExtras).onConflictDoNothing();
  });

  await seedOnce(database, "provenance-labels-v1", async (tx) => {
    await tx
      .update(sourcesTable)
      .set({
        snapshotVerifiedOn: sql`COALESCE(${sourcesTable.snapshotVerifiedOn}, '2026-10-31'::date)`,
        snapshotDriveModifiedTime: sql`COALESCE(${sourcesTable.snapshotDriveModifiedTime}, '2026-10-31T10:49:23.220Z'::timestamptz)`,
      })
      .where(
        and(
          eq(sourcesTable.id, "materials-master"),
          or(
            isNull(sourcesTable.snapshotVerifiedOn),
            isNull(sourcesTable.snapshotDriveModifiedTime),
          ),
        ),
      );

    await tx
      .update(lineMarkersTable)
      .set({
        decidedOn: sql`COALESCE(${lineMarkersTable.decidedOn}, '2026-11-01'::date)`,
        decisionReason: sql`
          COALESCE(
            ${lineMarkersTable.decisionReason},
            CASE ${lineMarkersTable.marker}
              WHEN 'common' THEN 'Same in all packs: structure, earthworks, networks and common works'
              WHEN 'not_applicable' THEN 'Not applicable in Premium'
              ELSE 'Premium-rated: Premium price applies'
            END
          )
        `,
      })
      .where(
        or(
          isNull(lineMarkersTable.decidedOn),
          isNull(lineMarkersTable.decisionReason),
        ),
      );

    await tx
      .update(capChaptersTable)
      .set({
        decidedOn: sql`COALESCE(${capChaptersTable.decidedOn}, '2026-11-01'::date)`,
        decisionReason: sql`COALESCE(${capChaptersTable.decisionReason}, 'Added at the user''s request.')`,
      })
      .where(
        and(
          eq(capChaptersTable.kind, "added"),
          or(
            isNull(capChaptersTable.decidedOn),
            isNull(capChaptersTable.decisionReason),
          ),
        ),
      );

    await tx
      .update(lineChapterOverridesTable)
      .set({
        decidedOn: sql`COALESCE(${lineChapterOverridesTable.decidedOn}, '2026-11-01'::date)`,
      })
      .where(isNull(lineChapterOverridesTable.decidedOn));

    await tx
      .update(extrasTable)
      .set({
        decidedOn: sql`COALESCE(${extrasTable.decidedOn}, '2026-10-31'::date)`,
        decisionReason: sql`COALESCE(${extrasTable.decisionReason}, 'Added at the user''s request; fixed one-house-unit item.')`,
      })
      .where(
        or(
          isNull(extrasTable.decidedOn),
          isNull(extrasTable.decisionReason),
        ),
      );
  });
}

export async function seedPlannerHouseTypes(database: typeof db = db): Promise<void> {
  await database
    .insert(houseTypesTable)
    .values([...plannerHouseTypeSeedRows])
    .onConflictDoNothing({ target: houseTypesTable.id });
}

let runtimeSeedPass: Promise<void> | undefined;

export function ensureBudgetSeedData(): Promise<void> {
  if (!runtimeSeedPass) {
    runtimeSeedPass = runBudgetSeedPass().catch((error: unknown) => {
      runtimeSeedPass = undefined;
      throw error;
    });
  }
  return runtimeSeedPass;
}
