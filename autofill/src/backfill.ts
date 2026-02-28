/**
 * dadash-telegram-autofill — Backfill / repair script
 *
 * Modes:
 *   --enrich        Re-queue conversations for enrichment (default)
 *   --link-spenders Link orphan tg_conversations (spender_id NULL) to existing/new spenders
 *   --manual-enrich Enqueue spenders created manually that have linked conversations
 *   --all-modes     Run all modes sequentially
 *
 * Options:
 *   --limit=N       Max rows per mode (default 200)
 *   --all           Include all conversations (not just last 7 days)
 *
 * Does NOT stop the listener — safe to run in parallel.
 */
import { db } from './supabaseClient.js';
import { log } from './logger.js';
import { upsertSpenderAndEvent } from './spenders/upsertSpenderAndEvent.js';

interface ConvRow {
  id: string;
  tg_chat_id: string;
  spender_id: string | null;
}

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 200;
const ALL_TIME = args.includes('--all');

const modeEnrich = args.includes('--enrich') || args.includes('--all-modes') || (!args.some((a) => a.startsWith('--') && !a.startsWith('--limit') && a !== '--all'));
const modeLinkSpenders = args.includes('--link-spenders') || args.includes('--all-modes');
const modeManualEnrich = args.includes('--manual-enrich') || args.includes('--all-modes');

async function enrichMode() {
  log.info('BACKFILL', 'enrich_start', { limit: LIMIT, mode: ALL_TIME ? 'all' : 'recent_7d' });

  let query = db
    .from('tg_conversations')
    .select('id, tg_chat_id')
    .not('tg_chat_id', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (!ALL_TIME) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    query = query.gte('last_message_at', sevenDaysAgo);
  }

  const { data: convs, error } = await query.returns<ConvRow[]>();

  if (error) {
    log.error('BACKFILL', 'fetch_conversations_failed', { error: error.message });
    return;
  }

  if (!convs || convs.length === 0) {
    log.info('BACKFILL', 'enrich_no_conversations');
    return;
  }

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

  log.info('BACKFILL', 'enrich_done', { enqueued, skipped, total: convs.length });
}

async function linkSpendersMode() {
  log.info('BACKFILL', 'link_spenders_start', { limit: LIMIT });

  const { data: orphans, error } = await db
    .from('tg_conversations')
    .select('id, tg_chat_id')
    .is('spender_id', null)
    .not('tg_chat_id', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT)
    .returns<ConvRow[]>();

  if (error) {
    log.error('BACKFILL', 'link_fetch_failed', { error: error.message });
    return;
  }

  if (!orphans || orphans.length === 0) {
    log.info('BACKFILL', 'link_no_orphans');
    return;
  }

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const conv of orphans) {
    try {
      // Get first inbound message meta to extract username
      const { data: firstMsg } = await db
        .from('tg_messages')
        .select('meta')
        .eq('conversation_id', conv.id)
        .eq('direction', 'in')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const meta = (firstMsg?.meta ?? {}) as Record<string, unknown>;
      const tgUserId = meta.tg_user_id ?? conv.tg_chat_id;
      const username = (meta.username as string) || undefined;
      const displayName = (meta.display_name as string) || undefined;

      const result = await upsertSpenderAndEvent({
        tg_user_id: tgUserId as string | number,
        username,
        display_name: displayName,
        conversation_id: conv.id,
      });

      if (result.created) {
        created++;
      } else {
        linked++;
      }
    } catch (err) {
      log.warn('BACKFILL', 'link_failed', {
        conv_id: conv.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  log.info('BACKFILL', 'link_done', { linked, created, skipped, total: orphans.length });
}

async function manualEnrichMode() {
  log.info('BACKFILL', 'manual_enrich_start', { limit: LIMIT });

  // Find spenders that have conversations but haven't been enriched
  const { data: convs, error } = await db
    .from('tg_conversations')
    .select('id, tg_chat_id, spender_id')
    .not('spender_id', 'is', null)
    .not('tg_chat_id', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT)
    .returns<ConvRow[]>();

  if (error) {
    log.error('BACKFILL', 'manual_fetch_failed', { error: error.message });
    return;
  }

  if (!convs || convs.length === 0) {
    log.info('BACKFILL', 'manual_no_conversations');
    return;
  }

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
      log.warn('BACKFILL', 'manual_enqueue_failed', { conv_id: conv.id, error: rpcErr.message });
      skipped++;
    } else {
      enqueued++;
    }
  }

  log.info('BACKFILL', 'manual_enrich_done', { enqueued, skipped, total: convs.length });
}

async function main() {
  log.info('BACKFILL', 'starting', { modes: { enrich: modeEnrich, link: modeLinkSpenders, manual: modeManualEnrich } });

  if (modeLinkSpenders) await linkSpendersMode();
  if (modeManualEnrich) await manualEnrichMode();
  if (modeEnrich) await enrichMode();

  log.info('BACKFILL', 'all_done');
  process.exit(0);
}

main().catch((err) => {
  log.error('BACKFILL', 'fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
