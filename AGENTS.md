# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**DADASH CRM** ("Pushy Team") is a CRM platform for online model agencies. It is a monorepo with independent sub-projects (no workspace-level package manager).

### Services

| Service | Path | Run (dev) | Notes |
|---|---|---|---|
| **Frontend SPA** | `/index.html` | `npx serve -s . -l 3333` | Single-file React PWA, transpiled in-browser via Babel. No bundler/build step. |
| **Worker** | `worker/` | `cd worker && npm run dev` | Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` |
| **Admin Bot** | `bot/` | `cd bot && npm run dev` | Requires `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| **Autofill Bot** | `autofill/` | `cd autofill && npm run dev` | Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN` |
| **Autofill Worker** | `autofill/` | `cd autofill && npm run dev:worker` | Same env vars as Autofill Bot |
| **Edge Functions** | `supabase/functions/` | Deno-based; requires Supabase CLI (`supabase functions serve`) | 7 Supabase Edge Functions |

### Key gotchas

- **No ESLint/Prettier config** in the repo. No linting commands are configured.
- **No root `package.json`**: each sub-project (`worker/`, `bot/`, `autofill/`) has its own `package.json` and must have `npm install` run independently.
- **`autofill/` has a pre-existing `tsc` type error** in `src/backfill.ts` (line 207). The `dev` commands use `tsx` which ignores type errors, so this does not block development.
- **`worker/` builds cleanly** with `npm run build` (`tsc`).
- **`bot/` is plain JavaScript** (`admin-bot.js`) — no build step needed.
- **Frontend needs no build step**: the single `index.html` loads React 18, Recharts, Supabase JS, and Babel from CDNs and transpiles JSX in-browser.
- **All backend services require Supabase + Telegram credentials** to run beyond initialization. Without valid env vars, they exit with a clear error message.
- **Env var templates**: see `.env.example` in `worker/`, `bot/`, and `autofill/`.
