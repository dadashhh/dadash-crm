import { db } from '../supabaseClient.js';
import { log } from '../logger.js';

export interface EnqueueParams {
  conversationId: string;
  tgUserId: number | string;
  lastMessageId?: number | null;
}

/**
 * Idempotent enqueue via DB function fn_enqueue_enrich.
 * ON CONFLICT(conversation_id): updates last_message_id, re-queues if done/failed.
 * Ne jamais appeler si tg_user_id est null/undefined — spender_enrich_queue.tg_user_id NOT NULL.
 */
export async function enqueueEnrich(p: EnqueueParams): Promise<string> {
  const tgNorm = String(p.tgUserId).replace(/\D/g, '');
  if (!tgNorm) {
    log.warn('QUEUE', 'skip_tg_user_id_empty', { conv_id: p.conversationId });
    throw new Error('enqueueEnrich: tg_user_id required (NOT NULL)');
  }

  const { data, error } = await db.rpc('fn_enqueue_enrich', {
    p_conversation_id: p.conversationId,
    p_tg_user_id: tgNorm,
    p_last_message_id: p.lastMessageId ?? null,
  });

  if (error) throw new Error(`enqueueEnrich: ${error.message}`);

  const queueId = data as string;

  log.info('QUEUE', 'enqueued', {
    conv_id: p.conversationId,
    tg_user_id: tgNorm,
    last_message_id: p.lastMessageId ?? 0,
  });

  return queueId;
}
