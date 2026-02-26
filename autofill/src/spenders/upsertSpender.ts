import { db } from '../supabaseClient.js';
import { log } from '../logger.js';

export interface UpsertSpenderParams {
  tgUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export interface UpsertResult {
  id: string;
  created: boolean;
}

/**
 * Idempotent spender upsert keyed on tg_user_id.
 * Creates a minimal row if missing, updates last_seen_at + basic info otherwise.
 * Never overwrites existing non-null fields with null.
 */
export async function upsertSpender(p: UpsertSpenderParams): Promise<UpsertResult> {
  const { tgUserId, username, firstName, lastName, displayName } = p;

  const { data: existing, error: selErr } = await db
    .from('spenders')
    .select('id')
    .eq('tg_user_id', tgUserId)
    .maybeSingle();

  if (selErr) throw new Error(`upsertSpender select: ${selErr.message}`);

  if (existing) {
    const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (username) updates.telegram_username = username;
    if (displayName || firstName) updates.name = displayName || firstName;

    await db.from('spenders').update(updates).eq('id', existing.id);

    log.info('SPENDER', 'upsert', { tg_user_id: tgUserId, created: false });
    return { id: existing.id, created: false };
  }

  const handle = username || `tg_${tgUserId}`;
  const name = displayName || firstName || handle;

  const telegramMeta = {
    user_id: tgUserId,
    username: username || null,
    display: username ? `@${username}` : String(tgUserId),
    first_name: firstName || null,
    last_name: lastName || null,
  };

  const { data: inserted, error: insErr } = await db
    .from('spenders')
    .insert({
      handle,
      name,
      tg_user_id: tgUserId,
      telegram_username: username || null,
      meta: { profile: { telegram: telegramMeta } },
      last_seen_at: new Date().toISOString(),
      status: 'active',
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: retry } = await db
        .from('spenders')
        .select('id')
        .eq('tg_user_id', tgUserId)
        .single();
      log.info('SPENDER', 'upsert', { tg_user_id: tgUserId, created: false, note: 'race_resolved' });
      return { id: retry!.id, created: false };
    }
    throw new Error(`upsertSpender insert: ${insErr.message}`);
  }

  log.info('SPENDER', 'upsert', { tg_user_id: tgUserId, created: true });

  await db.rpc('fn_insert_spender_event', {
    p_tg_user_id: tgUserId,
    p_event_type: 'new_spender',
    p_idempotency_key: `spender:${tgUserId}:created`,
    p_data: { handle, name, source: 'telegram_autofill' },
  });

  return { id: inserted.id, created: true };
}
