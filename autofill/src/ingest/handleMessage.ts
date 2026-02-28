import { db } from '../supabaseClient.js';
import { log } from '../logger.js';
import { upsertSpenderAndEvent } from '../spenders/upsertSpenderAndEvent.js';
import { enqueueEnrich } from '../queue/enqueueEnrich.js';
import { notifyNewMessage, notifyNewSpender } from '../notifications/notifyManager.js';

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
 *   3) upsert_spender_and_event (spender + event + link conversation)
 *   4) Enqueue enrichment
 *   5) Notify manager (new msg + new spender if applicable)
 */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const chatId = String(msg.chatId);

  // 1. Upsert conversation (with username/tg_user_id/display_name)
  const convUsername = msg.username?.replace(/^@/, '') || null;
  const convTgUserId = msg.tgUserId != null ? String(msg.tgUserId).replace(/\D/g, '') || null : null;
  const convDisplayName = [msg.firstName, msg.lastName].filter(Boolean).join(' ') || null;

  const { data: convId, error: convErr } = await db.rpc('upsert_tg_conversation', {
    p_tg_chat_id: chatId,
    p_username: convUsername,
    p_tg_user_id: convTgUserId,
    p_display_name: convDisplayName,
  });

  if (convErr || !convId) {
    log.error('INGEST', 'conv_upsert_failed', {
      chat_id: chatId,
      error: convErr?.message ?? 'null returned',
    });
    return;
  }

  // Fallback: if RPC doesn't support new params yet, patch directly
  if (convUsername || convTgUserId || convDisplayName) {
    const convPatch: Record<string, unknown> = {};
    if (convUsername) convPatch.username = convUsername;
    if (convTgUserId) convPatch.tg_user_id = convTgUserId;
    if (convDisplayName) convPatch.display_name = convDisplayName;
    try {
      await db.from('tg_conversations').update(convPatch).eq('id', convId);
    } catch {
      // Best-effort: RPC may already handle this
    }
  }

  // 2. Upsert message (idempotent)
  const tgMsgIdStr = String(msg.tgMessageId);
  const displayName = [msg.firstName, msg.lastName].filter(Boolean).join(' ') || undefined;

  if (!tgMsgIdStr || tgMsgIdStr === 'undefined' || tgMsgIdStr === 'null') {
    log.error('INGEST', 'msg_skip_no_tg_message_id', { chat_id: chatId });
    return;
  }

  log.info('INGEST', 'upsert_tg_message', { tg_message_id: tgMsgIdStr, conv_id: convId });

  const row = {
    conversation_id: convId,
    direction: msg.direction,
    text: msg.text,
    tg_message_id: tgMsgIdStr,
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
    const code = msgErr.code ?? '';
    const is400 = msgErr.message?.includes('400') || code === 'PGRST204';
    if (is400) {
      log.error('INGEST', 'msg_upsert_400_skip', {
        tg_message_id: tgMsgIdStr,
        error: msgErr.message,
      });
    } else if (code === '23505') {
      log.info('INGEST', 'msg_dedup', { msg_id: msg.tgMessageId, conv_id: convId });
      // Dedup = message already processed; still proceed to spender/enrich/notify
      // in case the previous run failed partway through
    } else {
      log.error('INGEST', 'msg_upsert_failed', {
        tg_message_id: tgMsgIdStr,
        error: msgErr.message,
        code,
      });
      return;
    }
  } else {
    log.info('INGEST', 'msg_upsert_ok', { tg_message_id: tgMsgIdStr, conv_id: convId });
  }

  // 3. Upsert spender + event + link conversation.spender_id
  const handle = msg.username ? `@${msg.username.replace(/^@/, '')}` : `tg_${chatId}`;
  let spenderId: string | undefined;
  let spenderCreated = false;

  try {
    const result = await upsertSpenderAndEvent({
      tg_user_id: msg.tgUserId,
      username: msg.username,
      display_name: displayName,
      message: msg.text,
      direction: msg.direction,
      conversation_id: convId,
      tg_message_id: msg.tgMessageId,
    });
    spenderId = result.spender_id;
    spenderCreated = result.created;
  } catch (err) {
    log.error('SPENDER', 'upsert_failed', {
      tg_user_id: msg.tgUserId,
      error: err instanceof Error ? err.message : String(err),
      chat_id: chatId,
      msg_id: msg.tgMessageId,
    });
  }

  // 4. Enqueue enrichment
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

  // 5. Notify manager (fail-safe, never throws)
  try {
    await notifyNewMessage({
      conversationId: convId,
      tgMessageId: msg.tgMessageId,
      handle,
      snippet: msg.text,
      spenderId,
    });

    if (spenderCreated && spenderId) {
      await notifyNewSpender({ spenderId, handle });
    }
  } catch (err) {
    log.error('NOTIF', 'pipeline_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
