import type {
  CapChapterInsert,
  LineChapterOverrideInsert,
} from "@workspace/db";
import { budgetMetaTable, capChaptersTable, db, lineChapterOverridesTable } from "@workspace/db";
import { logger } from "./logger";

let chapterDataSeeded = false;

export function getChapterSeedStatus() {
  return { seeded: chapterDataSeeded };
}

export async function seedChapterData(database: Pick<typeof db, "transaction"> = db): Promise<boolean> {
  try {
    await database.transaction(async (tx) => {
      const [newSeedMarker] = await tx
        .insert(budgetMetaTable)
        .values({ id: "cap-chapters-v1" })
        .onConflictDoNothing()
        .returning({ id: budgetMetaTable.id });
      if (newSeedMarker) {
        await tx.insert(capChaptersTable).values(capChapterSeedRows).onConflictDoNothing();
        await tx.insert(lineChapterOverridesTable).values(lineChapterOverrideSeedRows).onConflictDoNothing();
      }
    });
    chapterDataSeeded = true;
    return true;
  } catch (err) {
    chapterDataSeeded = false;
    logger.error({ err }, "Chapter data not seeded; API will continue and retry on next start");
    return false;
  }
}

export const capChapterSeedRows = [
  { code: "CAP. 0", name: "Estaleiro", sortOrder: 0, kind: "original", specReference: "CAP_00" },
  { code: "CAP. 1", name: "Terraplenagens", sortOrder: 1, kind: "original", specReference: "CAP_01" },
  { code: "CAP. 2", name: "Betão Armado", sortOrder: 2, kind: "original", specReference: "CAP_02" },
  { code: "CAP. 3", name: "Alvenarias", sortOrder: 3, kind: "original", specReference: "CAP_04" },
  { code: "CAP. 4", name: "Cantarias", sortOrder: 4, kind: "original", specReference: "CAP_05" },
  { code: "CAP. 5", name: "Pavimentos", sortOrder: 5, kind: "original", specReference: "CAP_11" },
  { code: "CAP. 6", name: "Revestimento de Paredes", sortOrder: 6, kind: "original", specReference: "CAP_06" },
  { code: "CAP. 7", name: "Carpintarias", sortOrder: 7, kind: "original", specReference: "CAP_09" },
  { code: "CAP. 16", name: "Caixilharias e Vidros", sortOrder: 8, kind: "added", specReference: "CAP_08", decidedOn: "2026-11-01", decisionReason: "Added at the user's request." },
  { code: "CAP. 8", name: "Serralharias", sortOrder: 9, kind: "original", specReference: "CAP_10" },
  { code: "CAP. 9", name: "Aparelhos Sanitários", sortOrder: 10, kind: "original", specReference: "CAP_12" },
  { code: "CAP. 10", name: "Cobertura", sortOrder: 11, kind: "original", specReference: "CAP_13" },
  { code: "CAP. 11", name: "Rede de Águas", sortOrder: 12, kind: "original", specReference: "CAP_14" },
  { code: "CAP. 12", name: "Esgotos Domésticos", sortOrder: 13, kind: "original", specReference: "CAP_14" },
  { code: "CAP. 13", name: "Águas Pluviais", sortOrder: 14, kind: "original", specReference: "CAP_14" },
  { code: "CAP. 14", name: "Instalações Elétricas", sortOrder: 15, kind: "original", specReference: "CAP_15" },
  { code: "CAP. 15", name: "Arranjos Exteriores", sortOrder: 16, kind: "original", specReference: "CAP_16" },
  { code: "CAP. 17", name: "Impermeabilizações", sortOrder: 17, kind: "added", specReference: "CAP_13", decidedOn: "2026-11-01", decisionReason: "Added at the user's request." },
  { code: "CAP. 18", name: "Isolamentos Térmicos", sortOrder: 18, kind: "added", specReference: null, decidedOn: "2026-11-01", decisionReason: "Added at the user's request." },
  { code: "CAP. 19", name: "AVAC", sortOrder: 19, kind: "added", specReference: "CAP_14", decidedOn: "2026-11-01", decisionReason: "Added at the user's request." },
] satisfies CapChapterInsert[];

export const lineChapterOverrideSeedRows = [
  {
    budgetLineCode: "7.1",
    chapterCode: "CAP. 16",
    reason: "Aluminum frames with double glazing; grouped in Caixilharias e Vidros.",
    decidedOn: "2026-11-01",
  },
  {
    budgetLineCode: "7.2",
    chapterCode: "CAP. 16",
    reason: "Armoured entrance door grouped with 7.1 by user instruction.",
    decidedOn: "2026-11-01",
  },
  {
    budgetLineCode: "1.4",
    chapterCode: "CAP. 17",
    reason: "Slope waterproofing; assigned to Impermeabilizações.",
    decidedOn: "2026-11-01",
  },
  {
    budgetLineCode: "10.2",
    chapterCode: "CAP. 18",
    reason: "Mineral-wool thermal insulation; assigned to Isolamentos Térmicos.",
    decidedOn: "2026-11-01",
  },
] satisfies LineChapterOverrideInsert[];
