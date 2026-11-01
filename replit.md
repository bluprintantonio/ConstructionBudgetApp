# FieldNotes

A home renovation tracker that connects the master quantity map, supplier documents, and architecture references.

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

- Google Drive is the source of truth. Every figure must carry a source tag (Drive file plus row/code) or be marked `ASSUMPTION` or `MANUAL`.
- Never alter, round, or recalculate source values; show them as supplied.
- Drive access is read-only. Never write, move, rename, or delete Drive content.
- Keep architecture references separate from estimate tiers unless the user confirms a source-based mapping.
- The master CSV has no currency field. EUR is an `ASSUMPTION` for display only; changing display currency does not convert values.
- Store all settings and scenarios in the database, never in the browser.
- Keep one calculation engine in `/lib/engine`; UI, exports, and summaries must call it. Do not implement calculations elsewhere.

## RULES

- The whole app works per ONE house unit. The CSV totals, the extras and the Planner are all for one unit. Never multiply by two or split into pairs unless I ask.

## Product boundaries

- Keep exactly these pages: Overview, Materials map, Quotes & documents, Sources.
- Add a Planner section only when a prompt asks for it.
- Locked design: dark green sidebar, cream background, current fonts, and card layout. Do not restyle without the user's request.
- The Planner page uses the villa planner design. Sidebar and other pages keep the FieldNotes design.
- Build only what the current prompt asks for. Ask when requirements are unclear or missing.
- Before a major change, explain the plan and wait for approval.
- After each task, list changed files, confirm what was tested, and stop for the user's next instruction.

## Product

- Review coded materials, quantities, and three estimate scenarios as supplied by the master CSV.
- Organize supplier documents by trade, status, and building reference.
- Open linked Drive sources without changing them.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The master CSV has no currency field; EUR is display-only and values are not converted.
- Source zeroes are preserved as supplied and are not interpreted as free or excluded items.
- Proposal PDF prices are not extracted, and Drive changes do not sync automatically.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
