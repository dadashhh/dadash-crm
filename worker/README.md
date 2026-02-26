# manager-notifier — Railway Worker

Polls `manager_alerts` in Supabase and sends Telegram messages to the manager.

## Architecture

```
Supabase DB triggers
  ├── payment_events.status → 'paid'    ──┐
  ├── transactions.status → 'valid'     ──┤
  ├── spenders.classification → 'vip'  ──┤→ INSERT manager_alerts (pending)
  ├── spenders.classification → 'hot'  ──┤
  ├── transactions.amount > 500 CHF    ──┤
  └── spender 3 TX / 24h              ──┘
           ↓  (every 5s)
   manager-notifier worker (Railway)
           ↓
   Telegram sendMessage → manager personal DM
```

## Env vars

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `PORT` | auto | HTTP port for Railway health checks |
| `POLL_INTERVAL_MS` | optional | Polling interval in ms (default: 5000) |

## Deploy to Railway

1. Create a new Railway service from this `worker/` folder.
2. Set the env vars above in Railway Settings → Variables.
3. Railway auto-detects Dockerfile and builds.

**Start command:** `node dist/index.js`
**Health check URL:** `GET /health`

## Local dev

```bash
cd worker
cp .env.example .env
# fill in .env
npm install
npm run dev
```

## Health endpoint

`GET /health` returns:
```json
{
  "status": "ok",
  "uptimeSeconds": 3600,
  "sentCount": 42,
  "errorCount": 1,
  "lastPollAt": "2026-02-26T12:00:00.000Z",
  "pollerRunning": true
}
```

## Manager setup

Before alerts will be sent, set the manager's Telegram chat_id:

```sql
INSERT INTO public.manager_settings (id, tg_chat_id)
VALUES (true, '123456789')
ON CONFLICT (id) DO UPDATE SET tg_chat_id = EXCLUDED.tg_chat_id;
```

To get your chat_id: send `/start` to your bot, then call:
```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

## Retry logic

| Condition | Behavior |
|---|---|
| Success | `status = 'sent'`, `sent_at = now()` |
| HTTP 403/400 from Telegram | `status = 'error'` immediately (fatal) |
| Other error, retry < 3 | `status = 'pending'`, exponential backoff (1s, 2s, 3s) |
| retry >= 3 | `status = 'error'` |
