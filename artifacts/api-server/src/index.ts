import app from "./app";
import { and, isNotNull, isNull, sql } from "drizzle-orm";
import {
  budgetQuotesTable,
  db,
  plannerInputsTable,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { seedChapterData } from "./lib/chapter-seed";
import { seedPlannerHouseTypes } from "./lib/budget-data-seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  await seedChapterData();

  await seedPlannerHouseTypes();

  await db
    .update(plannerInputsTable)
    .set({
      id: "twin-villa",
      houseTypeId: "twin-villa",
      standardReferenceSellingPrice: sql`COALESCE(${plannerInputsTable.standardReferenceSellingPrice}, ${plannerInputsTable.referenceSellingPrice})`,
      ecoReferenceSellingPrice: sql`COALESCE(${plannerInputsTable.ecoReferenceSellingPrice}, ${plannerInputsTable.referenceSellingPrice})`,
      premiumReferenceSellingPrice: sql`COALESCE(${plannerInputsTable.premiumReferenceSellingPrice}, ${plannerInputsTable.referenceSellingPrice})`,
    })
    .where(isNull(plannerInputsTable.houseTypeId));

  await db
    .update(budgetQuotesTable)
    .set({ driveUrl: sql`${budgetQuotesTable.sourceUrl}` })
    .where(
      and(
        isNull(budgetQuotesTable.driveUrl),
        isNotNull(budgetQuotesTable.sourceUrl),
      ),
    );

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer().catch((err: unknown) => {
  logger.error({ err }, "Error preparing database before server startup");
  process.exit(1);
});
