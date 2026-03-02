# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

DADASH ("Pushy Team") is a CRM for online model agencies. It consists of:

| Service | Directory | Language | Dev command |
|---|---|---|---|
| **Frontend SPA** | `/` (root `index.html`) | HTML + JSX (in-browser Babel) | `http-server . -p 8080 -c-1 --cors` |
| **Autofill Bot** | `autofill/` | TypeScript (Node.js) | `npm run dev` |
| **Autofill Enrich Worker** | `autofill/` | TypeScript (Node.js) | `npm run dev:worker` |
| **Manager Notifier Worker** | `worker/` | TypeScript (Node.js) | `npm run dev` |
| **Admin Bot** | `bot/` | JavaScript (Node.js) | `npm run dev` |
| **Supabase Edge Functions** | `supabase/functions/` | Deno | via Supabase CLI |

### Key caveats

- The frontend is a **single monolithic `index.html`** (~38K lines) using CDN-loaded React 18 + in-browser Babel. There is **no bundler/build step** for the frontend. Simply serve the root directory with any static HTTP server.
- The Vercel build command (`vercel.json`) only runs `scripts/inject-build-id.js` (injects a build ID into the HTML).
- All backend services require **Supabase credentials** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and Telegram services also need `TELEGRAM_BOT_TOKEN`. Without these, services will start but fail on first API call. See `.env.example` in each service directory.
- `autofill/` has a **pre-existing TypeScript error** in `src/backfill.ts` (line 207). The `tsc` build fails, but `tsx` (used by `npm run dev`) runs fine since it skips type-checking. The `dist/` folder has pre-committed build artifacts.
- The `autofill/` bot and worker both bind a health-check HTTP port (default 3000). Use different `PORT` env vars when running both locally (e.g., `PORT=3000` for bot, `PORT=3001` for worker).
- `bot/` is plain JavaScript (no TypeScript, no build step).
- The `worker/` package uses `npm` (has no lockfile); `autofill/` uses `npm` (has `package-lock.json`); `bot/` uses `npm` (no lockfile).
- No ESLint or Prettier is configured in this repository. Type-checking with `tsc --noEmit` is the primary static analysis tool.
