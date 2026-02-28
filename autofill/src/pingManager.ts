/**
 * Test script: send a ping to the manager via Telegram Bot API.
 * Usage: npx tsx src/pingManager.ts
 *
 * Required env vars: TELEGRAM_BOT_TOKEN, MANAGER_TG_CHAT_ID
 */
import { pingManager, isManagerNotifEnabled } from './notifications/notifyManager.js';

async function main() {
  if (!isManagerNotifEnabled()) {
    console.error('TELEGRAM_BOT_TOKEN and MANAGER_TG_CHAT_ID must be set');
    process.exit(1);
  }

  console.log('Sending ping to manager...');
  const ok = await pingManager();
  console.log(ok ? 'Ping sent successfully' : 'Ping failed — check bot token and chat_id');
  process.exit(ok ? 0 : 1);
}

main();
