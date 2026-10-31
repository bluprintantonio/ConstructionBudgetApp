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

- Use `boxes/mapa_quantidades.csv` as the master material and estimate source. Keep its Eco, Standard, and Premium scenarios separate.
- Keep architectural references in `arquitetura` separate from estimate tiers; do not map them without source evidence.
- Drive records are seeded as editable app data with links back to their source files. The initial build does not write to Drive or extract prices from PDFs.
- EUR is a display assumption because the master CSV has no currency field. Changing display currency changes formatting only and does not convert values.

## Product

- Review coded materials, quantities, and three estimate scenarios.
- Organize supplier documents by trade, status, and building reference.
- Edit materials, import/export the master CSV, and open linked Drive sources.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The master CSV has no currency field; EUR is display-only and values are not converted.
- Source zeroes are preserved as supplied and are not interpreted as free or excluded items.
- Proposal PDF prices are not extracted, and Drive changes do not sync automatically.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
