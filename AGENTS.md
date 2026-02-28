# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

DADASH CRM (Pushy Team) is a monorepo with 4 deployable units:

| Path | Description | Tech |
|---|---|---|
| `/` (root) | Frontend PWA — single `index.html` (~30k lines), React 18 + Babel transpiled in-browser | Static HTML/JS, Vercel |
| `autofill/` | Telegram autofill bot + enrichment worker | TypeScript, Node.js >= 20, npm |
| `worker/` | Manager notifier worker | TypeScript, Node.js >= 20, npm |
| `bot/` | Admin Telegram bot | JavaScript, Node.js, npm |

There is **no root-level `package.json`**. Each sub-project (`autofill/`, `worker/`, `bot/`) has its own independent `package.json`.

### Running the frontend locally

The frontend is a static PWA. Serve it from the repo root:

```bash
npx serve /workspace -l 3333 -s
```

The app loads React, Babel, Supabase JS, Recharts from CDNs and transpiles JSX in-browser. Give it ~5-10 seconds to fully render after page load.

Login requires valid Supabase credentials (the Supabase URL and anon key are embedded in `index.html`). Without a test account, you will see "Invalid login credentials".

### Building TypeScript services

```bash
cd autofill && npm run build   # tsc — emits to dist/ (one known type error in backfill.ts, but noEmitOnError is not set so JS is still emitted)
cd worker && npm run build     # tsc — emits to dist/, builds cleanly
```

### Running backend services locally

All three backend services require external credentials. See `.env.example` files in each directory. Required env vars:

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — for all services
- `TELEGRAM_BOT_TOKEN` — for autofill and worker
- `BOT_TOKEN` + `ADMIN_TELEGRAM_ID` + `SUPABASE_SERVICE_KEY` — for bot

Dev commands (with hot-reload via tsx):

```bash
cd autofill && npm run dev          # bot
cd autofill && npm run dev:worker   # enrichment worker
cd worker && npm run dev            # manager notifier
cd bot && npm run dev               # admin bot (node --watch)
```

### Linting / testing

There are no dedicated lint or test scripts configured in any of the sub-packages. TypeScript compilation (`npm run build`) is the primary code quality check for `autofill/` and `worker/`.

### Key gotchas

- The frontend is a single monolithic `index.html` file (~30k lines). Edits must be careful not to break Babel transpilation.
- There is no build step for the frontend — it transpiles JSX in-browser via Babel Standalone.
- The `vercel.json` build command (`node scripts/inject-build-id.js`) only injects git commit SHA into `index.html` and `sw.js` for cache busting.
- Only `autofill/` has a `package-lock.json`. The `worker/` and `bot/` packages don't have lockfiles.
