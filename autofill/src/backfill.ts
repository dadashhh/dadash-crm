/**
 * dadash-telegram-autofill — Backfill script
 *
 * Re-queues conversations for enrichment.
 * Usage: npm run backfill:enrich -- --limit=50 [--all]
 *
 * By default: only conversations updated in the last 7 days.
 * With --all: all conversations with a tg_user_id.
 */
import { db } from './supabaseClient.js';
import { log } from './logger.js';

interface ConvRow {
  id: string;
  tg_chat_id: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;
  const all = args.includes('--all');

  log.info('BACKFILL', 'starting', { limit, mode: all ? 'all' : 'recent_7d' });

  let query = db
    .from('tg_conversations')
    .select('id, tg_chat_id')
    .not('tg_chat_id', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!all) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    query = query.gte('last_message_at', sevenDaysAgo);
  }

  const { data: convs, error } = await query.returns<ConvRow[]>();

  if (error) {
    log.error('BACKFILL', 'fetch_conversations_failed', { error: error.message });
    process.exit(1);
  }

  if (!convs || convs.length === 0) {
    log.info('BACKFILL', 'no_conversations_found');
    process.exit(0);
  }

  log.info('BACKFILL', 'conversations_found', { count: convs.length });

  let enqueued = 0;
  let skipped = 0;

  for (const conv of convs) {
    const tgUserId = parseInt(conv.tg_chat_id, 10);
    if (isNaN(tgUserId) || tgUserId <= 0) {
      skipped++;
      continue;
    }

    const { error: rpcErr } = await db.rpc('fn_enqueue_enrich', {
      p_conversation_id: conv.id,
      p_tg_user_id: tgUserId,
      p_last_message_id: null,
    });

    if (rpcErr) {
      log.warn('BACKFILL', 'enqueue_failed', { conv_id: conv.id, error: rpcErr.message });
      skipped++;
    } else {
      enqueued++;
    }
  }

  log.info('BACKFILL', 'done', { enqueued, skipped, total: convs.length });
  process.exit(0);
}

main().catch((err) => {
  log.error('BACKFILL', 'fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
