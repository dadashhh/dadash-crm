/**
 * Manager notifications via Telegram Bot API.
 * Idempotent via notification_log table.
 * Fail-safe: errors are logged, never thrown.
 */
import { db } from '../supabaseClient.js';
import { log } from '../logger.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_TG_CHAT_ID;
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://dadash.co').replace(/\/$/, '');

const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

export function isManagerNotifEnabled(): boolean {
  return !!(TG_API && MANAGER_CHAT_ID);
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!TG_API || !MANAGER_CHAT_ID) return false;
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: MANAGER_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      log.error('NOTIF', 'tg_api_error', { status: res.status, desc: data.description ?? '' });
      return false;
    }
    return true;
  } catch (err) {
    log.error('NOTIF', 'tg_send_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function isDuplicate(key: string): Promise<boolean> {
  try {
    const { data } = await db
      .from('notification_log')
      .select('id')
      .eq('idempotency_key', key)
      .maybeSingle();
    return data !== null;
  } catch {
    return false;
  }
}

async function recordSent(key: string): Promise<void> {
  try {
    await db
      .from('notification_log')
      .insert({ idempotency_key: key, channel: 'telegram', status: 'sent' });
  } catch (err) {
    log.warn('NOTIF', 'log_write_failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function spenderLink(handle: string): string {
  const clean = handle.replace(/^@/, '');
  return `${APP_BASE_URL}/#spender/${encodeURIComponent(clean)}`;
}

// ── Public API ──────────────────────────────────────────────

export async function notifyNewMessage(opts: {
  conversationId: string;
  tgMessageId: number | string;
  handle: string;
  snippet: string;
  spenderId?: string;
}): Promise<void> {
  if (!isManagerNotifEnabled()) return;

  const key = `mgr:new_msg:${opts.conversationId}:${opts.tgMessageId}`;

  try {
    if (await isDuplicate(key)) return;

    const link = opts.spenderId ? spenderLink(opts.handle) : '';
    const snippet = (opts.snippet || '').slice(0, 150).replace(/</g, '&lt;');
    const text =
      `📩 <b>[NEW MSG]</b> ${escapeHtml(opts.handle)}\n` +
      `"${snippet}"\n` +
      (link ? `\n${link}` : '');

    const ok = await sendTelegram(text);
    if (ok) {
      await recordSent(key);
      log.info('NOTIF', 'new_msg_ok', { conv: opts.conversationId });
    } else {
      log.error('NOTIF', 'new_msg_fail', { conv: opts.conversationId });
    }
  } catch (err) {
    log.error('NOTIF', 'new_msg_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyNewSpender(opts: {
  spenderId: string;
  handle: string;
}): Promise<void> {
  if (!isManagerNotifEnabled()) return;

  const key = `mgr:new_spender:${opts.spenderId}`;

  try {
    if (await isDuplicate(key)) return;

    const link = spenderLink(opts.handle);
    const text =
      `🆕 <b>[NEW SPENDER]</b> ${escapeHtml(opts.handle)}\n` +
      `Créé automatiquement\n` +
      `\n${link}`;

    const ok = await sendTelegram(text);
    if (ok) {
      await recordSent(key);
      log.info('NOTIF', 'new_spender_ok', { spender_id: opts.spenderId });
    } else {
      log.error('NOTIF', 'new_spender_fail', { spender_id: opts.spenderId });
    }
  } catch (err) {
    log.error('NOTIF', 'new_spender_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send a raw ping to verify the bot token + chat_id work.
 * Returns true if Telegram accepted the message.
 */
export async function pingManager(): Promise<boolean> {
  if (!TG_API || !MANAGER_CHAT_ID) {
    log.error('NOTIF', 'ping_missing_config', {
      has_token: !!BOT_TOKEN,
      has_chat_id: !!MANAGER_CHAT_ID,
    });
    return false;
  }
  return sendTelegram('🏓 <b>PING DADASH</b>\nBot notifier is alive.');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
