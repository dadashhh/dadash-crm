import { db } from '../supabaseClient.js';
import { log } from '../logger.js';
import { upsertSpender } from '../spenders/upsertSpender.js';
import { enqueueEnrich } from '../queue/enqueueEnrich.js';

export interface IncomingMessage {
  chatId: string | number;
  tgUserId: number;
  tgMessageId: number;
  text: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  direction: 'in' | 'out';
}

/**
 * Full pipeline for one incoming Telegram message:
 *   1) Upsert conversation → get conversation_id
 *   2) Insert message into tg_messages (idempotent)
 *   3) Upsert spender (minimal, immediate)
 *   4) Enqueue enrichment
 */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const chatId = String(msg.chatId);

  // 1. Upsert conversation via existing RPC
  const { data: convId, error: convErr } = await db.rpc('upsert_tg_conversation', {
    p_tg_chat_id: chatId,
  });

  if (convErr || !convId) {
    log.error('INGEST', 'conv_upsert_failed', {
      chat_id: chatId,
      error: convErr?.message ?? 'null returned',
    });
    return;
  }

  // 2. Insert message (idempotent via partial unique index on conversation_id + tg_message_id)
  const tgMsgIdStr = String(msg.tgMessageId);

  const displayName = [msg.firstName, msg.lastName].filter(Boolean).join(' ') || undefined;

  const { error: msgErr } = await db.from('tg_messages').insert({
    conversation_id: convId,
    direction: msg.direction,
    text: msg.text,
    tg_message_id: tgMsgIdStr,
    meta: {
      tg_user_id: msg.tgUserId,
      username: msg.username || null,
      display_name: displayName || null,
    },
  });

  if (msgErr) {
    if (msgErr.code === '23505') {
      log.info('INGEST', 'msg_dedup', { msg_id: msg.tgMessageId, conv_id: convId });
      return;
    }
    log.error('INGEST', 'msg_insert_failed', {
      msg_id: msg.tgMessageId,
      error: msgErr.message,
    });
    return;
  }

  log.info('INGEST', 'msg_ok', { msg_id: msg.tgMessageId, conv_id: convId });

  // 2b. Insert spender_event new_message (pour Activity feed DADASH)
  try {
    await db.rpc('fn_insert_spender_event', {
      p_tg_user_id: msg.tgUserId,
      p_event_type: 'new_message',
      p_idempotency_key: `msg:${msg.tgUserId}:${msg.tgMessageId}`,
      p_data: { summary: msg.text?.slice(0, 100) || null },
    });
  } catch {
    // Ignore dedup/constraint errors
  }

  // 3. Upsert spender
  try {
    await upsertSpender({
      tgUserId: msg.tgUserId,
      username: msg.username,
      firstName: msg.firstName,
      lastName: msg.lastName,
      displayName,
    });
  } catch (err) {
    log.error('SPENDER', 'upsert_failed', {
      tg_user_id: msg.tgUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Enqueue enrichment
  try {
    await enqueueEnrich({
      conversationId: convId,
      tgUserId: msg.tgUserId,
      lastMessageId: msg.tgMessageId,
    });
  } catch (err) {
    log.error('QUEUE', 'enqueue_failed', {
      conv_id: convId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
