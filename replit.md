# Construction Budget

A construction budget workspace that connects source-sheet entries, supplier documents, and building references.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/construction-budget run dev` — run the construction budget app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Keep the source sheet's `receitas`, `balanço`, `investimento`, and `despesas` fields distinct; do not interpret them as budget, actual, or variance without confirmation.
- Drive records are seeded as editable app data with links back to their source files. The initial build does not write to Drive or extract prices from PDFs.
- EUR is the default display assumption; changing the display currency changes formatting only and does not convert values.

## Product

- Review the source-sheet figures and budget lines.
- Organize supplier documents by trade, status, and building reference.
- Edit records, import/export budget-line CSV, and open the linked Drive sources.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Imported figures and proposal prices are marked for review; confirm their meaning and amount against the original source.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
