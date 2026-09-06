# Zenthra — AI Agent for On-Chain Intelligence

Ask a question. Zenthra does the research. An AI agent that investigates the on-chain and market world — wallets, tokens, futures — and shows its evidence, backed by a shared research engine (web + WhatsApp) and a deterministic Confluence Score for futures reads.

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
- `artifacts/api-server/src/lib/scoring/confluence.ts` — the Futures Intelligence Confluence Score (weighted categories, honest about which ones have real data connected)
- `artifacts/api-server/src/routes/admin.ts` — internal control-center endpoints (users, usage, data-source status), all `requireAdmin`-gated
- `artifacts/landing/index.html` — public landing page (static, no build step)
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and schemas (note: `/signals`'s Confluence Score fields and a few newer endpoints — `/watchlist`, `/alerts`, `/token/:symbol`, `/admin/*` — predate this spec and aren't in it yet; the frontend calls them directly via `customFetch`)

## Architecture decisions

- The web artifact stays separate from the shared API server; `/api` is routed through the workspace proxy in dev, and through one combined Vercel deployment in production (root `vercel.json` — see `DEPLOY.md`).
- CoinGecko and Binance are used for public market/futures data (no key required), while Helius is optional and reports a clear configuration error when unavailable.
- AI chat uses the user-provided Gemini secret and has an honest "temporarily unavailable" fallback (never a scripted fake answer) if the AI request fails.
- The Confluence Score computes Market Structure and Momentum+Volume from the existing technical/SMC engine, and Open Interest/Funding from real Binance data — Liquidations, On-chain, and Market/News Context are intentionally left `available: false` until a real source is connected, rather than estimated.

## Product

Zenthra centers on an AI Research workspace (`/ai`) backed by a real agent loop, plus Discover (guided research prompts), Futures Intelligence (Confluence Score research per pair) and a compact Signals desk, Markets/Token detail, Wallet/Entities/Smart Money intelligence, and Monitor (a merged watchlist + alerts surface). WhatsApp and the old sticker/download/enhance-image tools are no longer part of the public product identity — WhatsApp remains as backend infrastructure for a possible future notification channel; the underlying tool code for the rest is left in place but no longer registered with the agent. Admin is a separate, unlinked `/admin` control center, key-gated (in-memory only, never persisted to the browser).

## User preferences

No persistent preferences recorded.

## Gotchas

- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.
- The artifact build expects workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
