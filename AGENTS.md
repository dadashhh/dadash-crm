# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

DADASH CRM ("Pushy Team") — a CRM platform for online model agencies. The codebase is an **informal monorepo** with four independent sub-projects (no workspace manager):

| Sub-project | Path | Language | Purpose |
|---|---|---|---|
| **Frontend SPA** | `/index.html` (root) | React 18 + Babel in-browser | Main CRM UI — monolithic 38K-line HTML file, no bundler |
| **Autofill bot + worker** | `autofill/` | TypeScript (Node.js ≥ 20) | Telegram bot ingests messages, worker enriches spender profiles |
| **Manager notifier** | `worker/` | TypeScript (Node.js ≥ 20) | Polls `manager_alerts` → sends Telegram notifications |
| **Admin bot** | `bot/` | JavaScript (Node.js) | Telegram admin bot for manager commands |

### Running the frontend

The frontend has **no build toolchain** (no Vite/webpack). Serve the repo root via any static HTTP server:

```bash
npx http-server . -p 8080 -c-1 --cors
```

Then open `http://localhost:8080/index.html`. Babel transpiles the JSX in-browser (takes a few seconds on first load).

**Gotcha**: `npx http-server` without `.` defaults to a `./public` directory if it exists — always specify `.` explicitly.

The frontend requires valid `SUPABASE_URL` and `SUPABASE_ANON_KEY` values embedded in `index.html` (lines ~3115-3116) to connect to the backend. Without them, the app renders but shows a "Reconnexion..." dialog. The Vercel build script (`scripts/inject-build-id.js`) injects these from env vars at deploy time.

### Building backend services

```bash
cd autofill && npm run build   # tsc — has a pre-existing type error in backfill.ts (non-blocking, JS still emits)
cd worker && npm run build     # tsc — clean
```

The `bot/` sub-project is plain JS and needs no build step.

### Type-checking (lint equivalent)

There is no ESLint or Prettier configured. The lint equivalent is TypeScript type-checking:

```bash
cd autofill && npx tsc --noEmit   # known pre-existing error in src/backfill.ts
cd worker && npx tsc --noEmit     # clean
```

### Backend services require secrets

All three backend services (`autofill/`, `worker/`, `bot/`) require:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token from @BotFather

See each sub-project's `.env.example` for the full list of variables.

### Supabase Edge Functions

Seven edge functions live in `supabase/functions/`. They are Deno/TypeScript and deploy via the Supabase CLI (`supabase functions deploy`). They are not run locally during normal development.

### Migrations

Two migration directories exist:
- `supabase/migrations/` — primary (80+ Supabase CLI-managed SQL files)
- `migrations/` — standalone SQL migration files (27 files)
