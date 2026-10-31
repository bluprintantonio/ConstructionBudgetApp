import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  jsonb,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type SourceChild = {
  name: string;
  type: string;
  modifiedTime: string | null;
};

export const sourceTypeEnum = pgEnum("source_type", ["csv", "folder"]);
export const budgetLineOriginEnum = pgEnum("budget_line_origin", [
  "imported",
  "manual",
  "assumption",
]);
export const extraPriceStatusEnum = pgEnum("extra_price_status", [
  "estimate",
  "quoted",
  "pending",
]);

export const budgetMetaTable = pgTable("budget_meta", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sourcesTable = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: sourceTypeEnum("type").notNull(),
  driveFileId: text("drive_file_id").notNull(),
  driveUrl: text("drive_url").notNull(),
  driveModifiedTime: timestamp("drive_modified_time", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  status: text("status"),
  itemCount: integer("item_count"),
  children: jsonb("children").$type<SourceChild[]>().notNull().default([]),
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
  sourceId: text("source_id").references(() => sourcesTable.id),
  origin: budgetLineOriginEnum("origin").notNull().default("manual"),
  priceBasis: text("price_basis"),
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

export const extrasTable = pgTable("extras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inEco: boolean("in_eco").notNull(),
  inPremium: boolean("in_premium").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unit: text("unit").notNull(),
  priceScope: text("price_scope").notNull().default("per house unit"),
  unitPrice: real("unit_price"),
  priceStatus: extraPriceStatusEnum("price_status").notNull().default("pending"),
  quoteId: text("quote_id").references(() => budgetQuotesTable.id),
  notes: text("notes"),
});
