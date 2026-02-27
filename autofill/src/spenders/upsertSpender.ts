import { db } from '../supabaseClient.js';
import { log } from '../logger.js';
import { writeSpenderEvent } from '../utils/spenderHelpers.js';

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

/** handle: @username si dispo, sinon tg_<id> pour unicité/affichage */
function computeHandle(username: string | undefined, tgUserId: number): string {
  const u = username?.replace(/^@/, '').trim();
  return u ? (u.startsWith('@') ? u : `@${u}`) : `tg_${tgUserId}`;
}

/** display_name: "First Last" si dispo, sinon null */
function computeDisplayName(firstName?: string, lastName?: string, displayName?: string): string | null {
  const parts = [firstName, lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(' ').trim() || null;
  return displayName?.trim() || null;
}

/**
 * Idempotent spender upsert keyed on tg_user_id.
 * Conventions: handle (@username ou tg_<id>), display_name (First Last), meta.profile.telegram.
 * Ne jamais écraser un champ non vide par du vide.
 */
export async function upsertSpender(p: UpsertSpenderParams): Promise<UpsertResult> {
  const { tgUserId, username, firstName, lastName, displayName } = p;

  const handle = computeHandle(username, tgUserId);
  const display_name = computeDisplayName(firstName, lastName, displayName);
  const name = display_name || handle;

  const telegramMeta = {
    username: username?.replace(/^@/, '') || null,
    first_name: firstName || null,
    last_name: lastName || null,
    display: username ? `@${username.replace(/^@/, '')}` : String(tgUserId),
    user_id: tgUserId,
  };

  const { data: existing, error: selErr } = await db
    .from('spenders')
    .select('id, handle, display_name, name, meta, first_name')
    .eq('tg_user_id', tgUserId)
    .maybeSingle();

  if (selErr) throw new Error(`upsertSpender select: ${selErr.message}`);

  const now = new Date().toISOString();

  if (existing) {
    const currentMeta = (existing.meta as Record<string, unknown>) || {};
    const currentProfile = (currentMeta.profile as Record<string, unknown>) || {};
    const currentTelegram = (currentProfile.telegram as Record<string, unknown>) || {};

    const mergedTelegram = { ...currentTelegram };
    if (telegramMeta.username) mergedTelegram.username = telegramMeta.username;
    if (telegramMeta.first_name) mergedTelegram.first_name = telegramMeta.first_name;
    if (telegramMeta.last_name) mergedTelegram.last_name = telegramMeta.last_name;
    if (telegramMeta.display) mergedTelegram.display = telegramMeta.display;

    const mergedProfile = { ...currentProfile, telegram: mergedTelegram };
    const newMeta = { ...currentMeta, profile: mergedProfile };

    const updates: Record<string, unknown> = {
      last_seen_at: now,
      updated_at: now,
      meta: newMeta,
    };
    if (handle && !existing.handle) updates.handle = handle;
    if (display_name && !existing.display_name) updates.display_name = display_name;
    if (name && (!existing.name || existing.name.startsWith('tg_'))) updates.name = name;
    if (firstName && !(existing as { first_name?: string }).first_name) updates.first_name = firstName;

    await db.from('spenders').update(updates).eq('id', existing.id);

    log.info('UPSERT', 'spender', {
      tg_user_id: tgUserId,
      created: false,
      handle: handle || existing.handle,
      display: display_name || existing.display_name,
    });
    return { id: existing.id, created: false };
  }

  const { data: inserted, error: insErr } = await db
    .from('spenders')
    .insert({
      handle,
      display_name: display_name || null,
      name,
      first_name: firstName || null,
      tg_user_id: tgUserId,
      telegram_username: username?.replace(/^@/, '') || null,
      meta: { profile: { telegram: telegramMeta } },
      last_seen_at: now,
      updated_at: now,
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
      log.info('UPSERT', 'spender', { tg_user_id: tgUserId, created: false, note: 'race_resolved' });
      return { id: retry!.id, created: false };
    }
    throw new Error(`upsertSpender insert: ${insErr.message}`);
  }

  log.info('UPSERT', 'spender', {
    tg_user_id: tgUserId,
    created: true,
    handle,
    display: display_name,
  });

  await writeSpenderEvent(db, {
    tgUserId,
    eventType: 'new_spender',
    idempotencyKey: `spender:${tgUserId}:created`,
    summary: `Nouveau spender: ${handle}`,
    payload: { handle, name, source: 'telegram_autofill' },
  });

  return { id: inserted.id, created: true };
}
