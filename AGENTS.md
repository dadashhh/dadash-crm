# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DADASH ("Pushy Team") is a CRM platform for online model agencies. It consists of:

| Service | Directory | Language | Dev command | Notes |
|---|---|---|---|---|
| **Frontend SPA** | `/index.html` (root) | React 18 + Babel in-browser | `serve -l 8080 -s .` (any static server) | No build step; CDN-loaded deps, in-browser JSX transpilation |
| **Autofill Bot** | `/autofill/` | TypeScript (Node.js) | `npm run dev` | Telegram bot; requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` |
| **Autofill Worker** | `/autofill/` | TypeScript (Node.js) | `npm run dev:worker` | Enrichment worker; same env vars as bot |
| **Admin Bot** | `/bot/` | Plain JS (Node.js) | `npm run dev` | Telegram admin bot; requires `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| **Manager Notifier** | `/worker/` | TypeScript (Node.js) | `npm run dev` | Polling worker; requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` |
| **Supabase Edge Functions** | `/supabase/functions/` | Deno | `supabase functions serve` | 7 edge functions; requires Supabase CLI |

### Key caveats

- **Frontend has NO build step.** The `index.html` is a ~30K-line single file with React loaded via CDN and JSX transpiled by Babel Standalone in the browser. Just serve it with any static file server (e.g. `serve -l 8080 -s .` from the repo root).
- **The Vercel build command** (`node scripts/inject-build-id.js`) only injects a git SHA build ID into `index.html` and `sw.js`. It does not compile or bundle anything.
- **All backend services** require Supabase and Telegram credentials to run. Without them, they exit gracefully with a clear error. See `.env.example` in each service directory.
- **TypeScript build** (`npm run build` in `/autofill/` and `/worker/`): The worker builds cleanly. The autofill has a pre-existing strict TS error in `backfill.ts` (non-blocking for dev, core files compile fine). Pre-built `dist/` files are committed to the repo.
- **No monorepo tooling**: Each sub-service (`autofill/`, `bot/`, `worker/`) has its own independent `package.json` with npm as package manager. There is no root `package.json`.
- **No linter or test framework** is configured in any of the sub-projects.
- **Node.js >= 20** is required (specified in `engines`).

### Running the frontend locally

```bash
# From repo root
serve -l 8080 -s .
# Then open http://localhost:8080
```

### Installing dependencies

```bash
cd autofill && npm install && cd ..
cd bot && npm install && cd ..
cd worker && npm install && cd ..
```
