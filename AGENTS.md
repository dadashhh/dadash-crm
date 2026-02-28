# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

DADASH (Pushy Team) is a CRM for online model agencies. It consists of:

| Service | Directory | Stack | Dev command |
|---|---|---|---|
| **Frontend SPA** | `/` (`index.html`) | React 18 + Babel Standalone (in-browser JSX) | `npx serve -s . -l 8080` |
| **Autofill Bot** | `autofill/` | Node 20 + TypeScript + Grammy | `npm run dev` |
| **Autofill Worker** | `autofill/` | Node 20 + TypeScript | `npm run dev:worker` |
| **Manager Notifier** | `worker/` | Node 20 + TypeScript | `npm run dev` |
| **Admin Bot** | `bot/` | Node 20 + JavaScript + Grammy | `npm run dev` |
| **Supabase Edge Functions** | `supabase/functions/` | Deno | Supabase CLI |

### Key caveats

- **No root `package.json`**: Each sub-service (`autofill/`, `worker/`, `bot/`) has its own `package.json`. The root `.gitignore` explicitly ignores `/package.json`.
- **No build system for the frontend**: The monolithic `index.html` (~30K lines) uses in-browser Babel transpilation of JSX. No webpack/vite. Serve it as a static file.
- **No linter configured**: There is no ESLint/Prettier in any service. TypeScript compilation (`tsc`) in `autofill/` and `worker/` is the closest equivalent to linting.
- **No test framework**: No jest/vitest is configured. Testing is manual (SQL queries, Telegram smoke tests).
- **Supabase is remote**: The frontend connects to a hosted Supabase instance (URL + anon key hardcoded in `index.html`). All backend services require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
- **Telegram bots require tokens**: The `autofill/`, `worker/`, and `bot/` services all require Telegram bot tokens to start. Without them, they will fail at startup.
- **autofill `tsc` has a known type error** in `src/backfill.ts` (line 207) — does not block `tsx` dev mode or the emitted JS output since `noEmitOnError` is not set.

### Running the frontend locally

```bash
npx serve -s . -l 8080
```

Then open http://localhost:8080. The app will show the login page and connect to the remote Supabase instance.

### Building TypeScript services

```bash
cd autofill && npm run build   # tsc — emits to dist/ (has 1 non-blocking type error)
cd worker && npm run build     # tsc — emits to dist/
```

### Environment variables

Each service has a `.env.example` file. Copy to `.env` and fill in real values:

```bash
cp autofill/.env.example autofill/.env
cp worker/.env.example worker/.env
cp bot/.env.example bot/.env
```
