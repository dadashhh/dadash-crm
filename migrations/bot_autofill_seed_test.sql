-- =============================================
-- BOT AUTOFILL — Données de test pour l'UI
-- À exécuter après bot_autofill_monitoring.sql
-- =============================================

-- bot_runs: 1 row pour telegram_autofill
INSERT INTO bot_runs (bot_name, status, last_heartbeat_at, started_at, version, meta)
VALUES (
  'telegram_autofill',
  'online',
  now() - interval '12 seconds',
  now() - interval '2 hours',
  '1.0.0',
  '{"last_success_at": "2026-02-26T10:30:00Z", "uptime_pct": 99.2}'::jsonb
)
ON CONFLICT (bot_name) DO UPDATE SET
  status = EXCLUDED.status,
  last_heartbeat_at = EXCLUDED.last_heartbeat_at,
  started_at = EXCLUDED.started_at,
  version = EXCLUDED.version,
  meta = EXCLUDED.meta,
  updated_at = now();

-- bot_daily_metrics: stats du jour
INSERT INTO bot_daily_metrics (bot_name, day, msgs_ingested, spenders_created, spenders_updated, errors_count, enrich_pending, enrich_done, updated_at)
VALUES (
  'telegram_autofill',
  CURRENT_DATE,
  142,
  8,
  23,
  2,
  5,
  18,
  now()
)
ON CONFLICT (bot_name, day) DO UPDATE SET
  msgs_ingested = EXCLUDED.msgs_ingested,
  spenders_created = EXCLUDED.spenders_created,
  spenders_updated = EXCLUDED.spenders_updated,
  errors_count = EXCLUDED.errors_count,
  enrich_pending = EXCLUDED.enrich_pending,
  enrich_done = EXCLUDED.enrich_done,
  updated_at = now();

-- bot_events: quelques évènements de test
INSERT INTO bot_events (bot_name, level, event_type, message, created_at)
VALUES
  ('telegram_autofill', 'info', 'heartbeat', 'Heartbeat OK', now() - interval '12 seconds'),
  ('telegram_autofill', 'info', 'message_ingested', 'Message ingéré: @user123', now() - interval '2 minutes'),
  ('telegram_autofill', 'info', 'spender_created', 'Spender créé: @newuser', now() - interval '5 minutes'),
  ('telegram_autofill', 'warn', 'enrich_delayed', 'Enrichissement en attente', now() - interval '8 minutes'),
  ('telegram_autofill', 'error', 'api_limit', 'Rate limit API atteint', now() - interval '15 minutes'),
  ('telegram_autofill', 'info', 'startup', 'Bot démarré', now() - interval '2 hours')
;
