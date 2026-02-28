/**
 * dadash-telegram-autofill — Bot entry point
 *
 * Receives Telegram messages, runs the 3-step pipeline:
 *   1) Ingest message → tg_messages
 *   2) Upsert spender → spenders
 *   3) Enqueue enrichment → spender_enrich_queue
 */
import http from 'node:http';
import { Bot } from 'grammy';
import { handleIncomingMessage } from './ingest/handleMessage.js';
import { log } from './logger.js';
import { isManagerNotifEnabled, pingManager } from './notifications/notifyManager.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('FATAL: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!process.env.MANAGER_TG_CHAT_ID) {
  log.warn('BOT', 'MANAGER_TG_CHAT_ID not set — manager notifications disabled');
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const START_TIME = Date.now();
let msgCount = 0;
let errCount = 0;

// ── HTTP health endpoint ──
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        role: 'bot',
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        msgCount,
        errCount,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ── Grammy bot ──
const bot = new Bot(BOT_TOKEN);

bot.on('message', async (ctx) => {
  const msg = ctx.message;
  const from = msg.from;
  if (!from) return;

  const text = msg.text ?? msg.caption ?? '';
  if (!text) return;

  try {
    await handleIncomingMessage({
      chatId: msg.chat.id,
      tgUserId: from.id,
      tgMessageId: msg.message_id,
      text,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      direction: 'in',
    });
    msgCount++;
  } catch (err) {
    errCount++;
    log.error('BOT', 'handler_crash', {
      tg_user_id: from.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

bot.catch((err) => {
  errCount++;
  log.error('BOT', 'grammy_error', { error: err.message });
});

// ── Start ──
async function main() {
  server.listen(PORT, () => {
    log.info('BOT', 'health_server_started', { port: PORT });
  });

  if (isManagerNotifEnabled()) {
    const ok = await pingManager();
    log.info('BOT', 'manager_ping', { ok });
  }

  log.info('BOT', 'starting_polling');
  await bot.start({
    onStart: () => log.info('BOT', 'polling_started'),
  });
}

main().catch((err) => {
  log.error('BOT', 'fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
