# dadash-telegram-autofill

Bot Telegram + Worker d'enrichissement pour le pipeline Spender.

## Architecture

```
Telegram User (DM)
       │
       ▼
   [Bot] npm start
       │
       ├─ 1. INSERT tg_messages (idempotent via UNIQUE index)
       ├─ 2. UPSERT spenders (tg_user_id UNIQUE)
       └─ 3. ENQUEUE spender_enrich_queue (fn_enqueue_enrich)
                       │
                       ▼
              [Worker] npm run worker
                       │
                ┌──────┴──────┐
                │ fn_claim_enrich_job (FOR UPDATE SKIP LOCKED)
                │ Load tg_messages
                │ extractProfile(messages)
                │ deepMerge → spenders.meta.profile
                │ fn_insert_spender_event('profile_updated')
                │ fn_complete_enrich_job('done')
                └─────────────┘
```

## Prérequis

- Node.js >= 20
- Migrations SQL appliquées (voir `supabase/migrations/20260226_spender_pipeline_*.sql`)

## Variables d'environnement

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | — | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Clé service_role (bypass RLS) |
| `TELEGRAM_BOT_TOKEN` | ✅ (bot) | — | Token du bot @BotFather |
| `ENRICH_CONCURRENCY` | — | `1` | Jobs parallèles (garder à 1) |
| `ENRICH_BATCH_LIMIT` | — | `1` | Jobs par cycle de poll |
| `ENRICH_POLL_MS` | — | `5000` | Intervalle polling worker (ms) |
| `WORKER_ID` | — | `worker-<pid>` | Identifiant du worker (anti double-run) |
| `PORT` | — | `3000`/`3001` | Port HTTP health |

## Run locally

```bash
cd autofill
npm install
cp .env.example .env
# Remplir .env avec les vraies valeurs

# Bot (ingestion Telegram)
npm start

# Worker (enrichissement, dans un autre terminal)
npm run worker

# Backfill (re-enqueue les conversations récentes)
npm run backfill:enrich -- --limit=50

# Backfill ALL conversations
npm run backfill:enrich -- --all --limit=500
```

## Deploy sur Railway

### Service 1 : Bot

- **Root directory** : `autofill/`
- **Start command** : `node dist/index.js`
- **Health check** : `GET /health`

### Service 2 : Worker

- **Root directory** : `autofill/`
- **Start command** : `node dist/runWorker.js`
- **Health check** : `GET /health`

Les deux services partagent les mêmes env vars (sauf `PORT` auto-assigné par Railway).

## Health endpoints

### Bot (`GET /health`)

```json
{
  "status": "ok",
  "role": "bot",
  "uptimeSeconds": 3600,
  "msgCount": 142,
  "errCount": 0
}
```

### Worker (`GET /health`)

```json
{
  "status": "ok",
  "role": "enrich_worker",
  "uptimeSeconds": 3600,
  "enriched_ok": 42,
  "enriched_fail": 1,
  "queue_locked": 43,
  "queue_empty": 200,
  "running": true,
  "lastPollAt": "2026-02-26T12:00:00.000Z"
}
```

## Logs exemples

```
[INGEST] msg_ok msg_id=1842 conv_id=abc-def-123
[SPENDER] upsert tg_user_id=987654321 created=true
[QUEUE] enqueued conv_id=abc-def-123 last_message_id=1842
[ENRICH] locked conv_id=abc-def-123 tg_user_id=987654321
[UPSERT] profile_updated fields=age,city conv_id=abc-def-123
[EVENT] profile_updated idempotency_key=spender:987654321:profile:a1b2c3d4e5f6
[QUEUE] done conv_id=abc-def-123 last_message_id=1842
```

Chaque ligne est aussi émise en JSON structuré :

```json
{"ts":"2026-02-26T14:30:00.123Z","level":"info","scope":"INGEST","msg":"msg_ok","msg_id":1842,"conv_id":"abc-def-123"}
```

## SQL de vérification

```sql
-- Vérifier un spender
SELECT id, tg_user_id, handle, meta->'profile' as profile, last_seen_at
  FROM spenders
 WHERE tg_user_id = 987654321;

-- Derniers events d'un spender
SELECT event_type, idempotency_key, data, created_at
  FROM spender_events
 WHERE tg_user_id = 987654321
 ORDER BY created_at DESC
 LIMIT 10;

-- État de la queue
SELECT status, count(*), max(updated_at)
  FROM spender_enrich_queue
 GROUP BY status;

-- Jobs bloqués
SELECT * FROM spender_enrich_queue
 WHERE status = 'processing'
   AND locked_at < now() - INTERVAL '5 minutes';

-- Activity feed UI
SELECT * FROM v_activity_feed LIMIT 20;
```

## Idempotency keys

| Event | Key format | Exemple |
|---|---|---|
| `new_spender` | `spender:<tg_user_id>:created` | `spender:987654321:created` |
| `profile_updated` | `spender:<tg_user_id>:profile:<hash>` | `spender:987654321:profile:a1b2c3d4e5f6` |
| `new_message` | `msg:<tg_message_id>` | `msg:1842` |

## Modules

| Module | Rôle |
|---|---|
| `src/supabaseClient.ts` | Client Supabase service_role |
| `src/logger.ts` | Logs structurés JSON + tags |
| `src/ingest/handleMessage.ts` | Pipeline : message → spender → queue |
| `src/spenders/upsertSpender.ts` | UPSERT idempotent sur tg_user_id |
| `src/queue/enqueueEnrich.ts` | Enqueue via fn_enqueue_enrich RPC |
| `src/worker/enrichWorker.ts` | Loop claim → extract → merge → event → done |
| `src/profile/extractProfile.ts` | Extraction heuristique (remplaçable par LLM) |
| `src/utils/deepMerge.ts` | Merge récursif sans écraser les valeurs existantes |
| `src/backfill.ts` | Script de re-enqueue pour rattrapage |
