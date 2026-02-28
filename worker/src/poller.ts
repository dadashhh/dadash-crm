// ─────────────────────────────────────────────
// Poller: manager_alerts → Telegram
// ─────────────────────────────────────────────
import { db, type ManagerAlert } from './db.js';
import { sendMessage } from './telegram.js';

// ── Config ──────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10);
const BATCH_SIZE       = 50;
const MAX_RETRY        = 3;

// ── Metrics (exposed to /health) ─────────────
export interface Metrics {
  sentCount: number;
  errorCount: number;
  lastPollAt: string | null;
  running: boolean;
}
export const metrics: Metrics = {
  sentCount: 0,
  errorCount: 0,
  lastPollAt: null,
  running: false,
};

// ── Helpers ───────────────────────────────────
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch tg_chat_id: env var override → DB singleton fallback. */
async function getManagerChatId(): Promise<string | null> {
  const envChatId = process.env.MANAGER_TG_CHAT_ID;
  if (envChatId) return envChatId;

  const { data, error } = await db
    .from('manager_settings')
    .select('tg_chat_id')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    console.error('[POLLER] manager_settings fetch error:', error.message);
    return null;
  }
  if (!data?.tg_chat_id) {
    console.warn('[POLLER] No MANAGER_TG_CHAT_ID env var and manager_settings.tg_chat_id is empty');
    return null;
  }
  return data.tg_chat_id;
}

/** Process one batch of pending alerts. */
async function processBatch(chatId: string): Promise<void> {
  const { data: alerts, error } = await db
    .from('manager_alerts')
    .select('id, type, message, retry_count')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
    .returns<Pick<ManagerAlert, 'id' | 'type' | 'message' | 'retry_count'>[]>();

  if (error) {
    console.error('[POLLER] Fetch manager_alerts error:', error.message);
    return;
  }
  if (!alerts || alerts.length === 0) return;

  console.log(`[POLLER] Processing ${alerts.length} alert(s)`);

  for (const alert of alerts) {
    const result = await sendMessage(chatId, alert.message);

    if (result.ok) {
      await db
        .from('manager_alerts')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', alert.id);
      metrics.sentCount++;
      console.log(`[SENT]  ${alert.id} (${alert.type})`);
      continue;
    }

    // ── Error handling ─────────────────────────
    const retryCount = (alert.retry_count ?? 0) + 1;
    const isFatal =
      alert.message === '' ||
      result.httpStatus === 403 || // bot blocked
      result.httpStatus === 400 || // bad request (bad chat_id etc.)
      retryCount >= MAX_RETRY;

    const newStatus = isFatal ? 'error' : 'pending';

    await db
      .from('manager_alerts')
      .update({ status: newStatus, last_error: result.error, retry_count: retryCount })
      .eq('id', alert.id);

    metrics.errorCount++;
    console.error(
      `[ERROR] ${alert.id} (${alert.type}): ${result.error} — retry=${retryCount}/${MAX_RETRY} → ${newStatus}`,
    );

    // Exponential backoff between retries (non-fatal only)
    if (!isFatal) {
      await sleep(retryCount * 1000);
    }
  }
}

/** Main loop — runs forever until process exit. */
export async function startPoller(): Promise<void> {
  metrics.running = true;
  console.log(`[POLLER] Started (interval=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE})`);

  while (true) {
    metrics.lastPollAt = new Date().toISOString();
    try {
      const chatId = await getManagerChatId();
      if (chatId) {
        await processBatch(chatId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[POLLER] Unexpected error:', msg);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
