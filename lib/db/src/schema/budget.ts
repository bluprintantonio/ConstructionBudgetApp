import { pgTable, real, text, timestamp, integer } from "drizzle-orm/pg-core";

export const budgetMetaTable = pgTable("budget_meta", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const budgetLinesTable = pgTable("budget_lines", {
  id: text("id").primaryKey(),
  code: text("code"),
  category: text("category").notNull(),
  item: text("item").notNull(),
  unit: text("unit"),
  quantity: real("quantity"),
  standardUnitPrice: real("standard_unit_price"),
  standardTotal: real("standard_total"),
  ecoUnitPrice: real("eco_unit_price"),
  ecoTotal: real("eco_total"),
  premiumUnitPrice: real("premium_unit_price"),
  premiumTotal: real("premium_total"),
  buildingType: text("building_type"),
  vendor: text("vendor"),
  receitas: real("receitas"),
  balanco: real("balanco"),
  investimento: real("investimento"),
  despesas: real("despesas"),
  quoteAmount: real("quote_amount"),
  status: text("status").notNull().default("needs_review"),
  reviewStatus: text("review_status").notNull().default("unreviewed"),
  sourceRow: integer("source_row"),
  sourceNote: text("source_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const budgetQuotesTable = pgTable("budget_quotes", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  category: text("category").notNull(),
  vendor: text("vendor"),
  documentType: text("document_type").notNull().default("unknown"),
  status: text("status").notNull().default("needs_review"),
  amount: real("amount"),
  buildingType: text("building_type"),
  modifiedAt: timestamp("modified_at", { withTimezone: true }),
  sourceUrl: text("source_url").notNull(),
  sourceFolderUrl: text("source_folder_url"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
