import { db } from '../supabaseClient.js';
import { log } from '../logger.js';
import { upsertSpenderAndEvent } from '../spenders/upsertSpenderAndEvent.js';
import { enqueueEnrich } from '../queue/enqueueEnrich.js';

export interface IncomingMessage {
  chatId: string | number;
  tgUserId: number | string | null;
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
 *   2) Upsert message into tg_messages (idempotent via UNIQUE constraint)
 *   3) upsert_spender_and_event (unified: spender + event message)
 *   4) Enqueue enrichment (seulement si tg_user_id connu — évite crash NOT NULL)
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

  // 2. Upsert message (idempotent via UNIQUE(conversation_id, tg_message_id))
  // tg_message_id is BIGINT in production — send as number
  const tgMsgId = Number(msg.tgMessageId);
  const displayName = [msg.firstName, msg.lastName].filter(Boolean).join(' ') || undefined;

  if (!tgMsgId || isNaN(tgMsgId)) {
    log.error('INGEST', 'msg_skip_no_tg_message_id', { chat_id: chatId });
    return;
  }

  log.info('INGEST', 'upsert_tg_message', { tg_message_id: tgMsgId, conv_id: convId });

  const row = {
    conversation_id: convId,
    direction: msg.direction,
    text: msg.text,
    tg_message_id: tgMsgId,
    meta: {
      tg_user_id: msg.tgUserId ?? chatId,
      username: msg.username || null,
      display_name: displayName || null,
    },
  };

  const { error: msgErr } = await db
    .from('tg_messages')
    .upsert(row, { onConflict: 'conversation_id,tg_message_id' });

  if (msgErr) {
    // Never retry 400 errors (constraint/schema issues) — skip and continue
    const code = msgErr.code ?? '';
    const is400 = msgErr.message?.includes('400') || code === 'PGRST204';
    if (is400) {
      log.error('INGEST', 'msg_upsert_400_skip', {
        tg_message_id: tgMsgId,
        error: msgErr.message,
      });
      // Fall through to spender upsert — don't block the pipeline
    } else if (code === '23505') {
      log.info('INGEST', 'msg_dedup', { msg_id: tgMsgId, conv_id: convId });
      return;
    } else {
      log.error('INGEST', 'msg_upsert_failed', {
        tg_message_id: tgMsgId,
        error: msgErr.message,
        code,
      });
      return;
    }
  } else {
    log.info('INGEST', 'msg_upsert_ok', { tg_message_id: tgMsgId, conv_id: convId });
  }

  // 3. upsert_spender_and_event (unified: spender + event message)
  try {
    await upsertSpenderAndEvent({
      tg_user_id: msg.tgUserId,
      username: msg.username,
      display_name: displayName,
      message: msg.text,
      direction: msg.direction,
      conversation_id: convId,
      tg_message_id: msg.tgMessageId,
    });
  } catch (err) {
    log.error('SPENDER', 'upsert_failed', {
      tg_user_id: msg.tgUserId,
      error: err instanceof Error ? err.message : String(err),
      chat_id: chatId,
      msg_id: msg.tgMessageId,
    });
  }

  // 4. Enqueue enrichment — seulement si tg_user_id connu (évite crash spender_enrich_queue NOT NULL)
  const tgNorm = msg.tgUserId != null && String(msg.tgUserId).replace(/\D/g, '').length > 0;
  if (tgNorm) {
    try {
      await enqueueEnrich({
        conversationId: convId,
        tgUserId: msg.tgUserId as number | string,
        lastMessageId: msg.tgMessageId,
      });
    } catch (err) {
      log.error('QUEUE', 'enqueue_failed', {
        conv_id: convId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    log.info('QUEUE', 'skip_no_tg_user_id', { conv_id: convId, chat_id: chatId });
  }
}
