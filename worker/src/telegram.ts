// ─────────────────────────────────────────────
// Telegram sendMessage helper
// ─────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramResult {
  ok: boolean;
  error?: string;
  /** HTTP status from Telegram (400/403 = fatal, no retry) */
  httpStatus?: number;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
): Promise<TelegramResult> {
  let res: Response;
  try {
    res = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }

  let data: { ok: boolean; description?: string };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: `Invalid JSON (HTTP ${res.status})`, httpStatus: res.status };
  }

  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.description ?? `HTTP ${res.status}`,
      httpStatus: res.status,
    };
  }

  return { ok: true };
}
