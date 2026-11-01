import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const capChapterKindEnum = pgEnum("cap_chapter_kind", [
  "original",
  "added",
]);

export const capChaptersTable = pgTable("cap_chapters", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  kind: capChapterKindEnum("kind").notNull(),
  specReference: text("spec_reference"),
  decidedOn: date("decided_on", { mode: "string" }),
  decisionReason: text("decision_reason"),
});

export const lineChapterOverridesTable = pgTable("line_chapter_overrides", {
  budgetLineCode: text("budget_line_code").primaryKey(),
  chapterCode: text("chapter_code")
    .notNull()
    .references(() => capChaptersTable.code, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  decidedOn: date("decided_on", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCapChapterSchema = createInsertSchema(capChaptersTable);
export const insertLineChapterOverrideSchema =
  createInsertSchema(lineChapterOverridesTable).omit({ createdAt: true });

export type CapChapterInsert = z.infer<typeof insertCapChapterSchema>;
export type CapChapter = typeof capChaptersTable.$inferSelect;
export type LineChapterOverrideInsert = z.infer<
  typeof insertLineChapterOverrideSchema
>;
export type LineChapterOverride =
  typeof lineChapterOverridesTable.$inferSelect;
