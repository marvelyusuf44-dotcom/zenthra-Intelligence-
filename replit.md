# Zenthra Crypto Intelligence

Zenthra is a crypto intelligence workspace for live market context, Solana wallet analysis, on-chain signals, and AI-assisted research.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
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

- `artifacts/zenthra/src/App.tsx` — routed product UI and dashboard screens
- `artifacts/zenthra/src/index.css` — Zenthra visual language and motion
- `artifacts/api-server/src/routes/zenthra.ts` — market, signal, wallet, and AI chat endpoints
- `artifacts/api-server/src/lib/zenthra-data.ts` — CoinGecko/Helius adapters and signal data
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and schemas

## Architecture decisions

- The web artifact stays separate from the shared API server; `/api` is routed through the workspace proxy.
- CoinGecko is used for public market snapshots, while Helius is optional and reports a clear configuration error when unavailable.
- AI chat uses the user-provided Gemini secret and has a concise local fallback so the interface remains usable if the AI request fails.

## Product

Zenthra includes a responsive analyst workspace with market overview, token and exchange screens, on-chain activity, wallet analysis, transfer and transaction views, entity and smart-money tracking, signal desk, watchlist, alerts, wallet connection, API docs, account, theme settings, and an AI analyst chat.

## User preferences

No persistent preferences recorded.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- The artifact build expects workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
