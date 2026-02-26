import { db } from '../supabaseClient.js';
import { log } from '../logger.js';

export interface EnqueueParams {
  conversationId: string;
  tgUserId: number;
  lastMessageId?: number | null;
}

/**
 * Idempotent enqueue via DB function fn_enqueue_enrich.
 * ON CONFLICT(conversation_id): updates last_message_id, re-queues if done/failed.
 */
export async function enqueueEnrich(p: EnqueueParams): Promise<string> {
  const { data, error } = await db.rpc('fn_enqueue_enrich', {
    p_conversation_id: p.conversationId,
    p_tg_user_id: p.tgUserId,
    p_last_message_id: p.lastMessageId ?? null,
  });

  if (error) throw new Error(`enqueueEnrich: ${error.message}`);

  const queueId = data as string;

  log.info('QUEUE', 'enqueued', {
    conv_id: p.conversationId,
    tg_user_id: p.tgUserId,
    last_message_id: p.lastMessageId ?? 0,
  });

  return queueId;
}
