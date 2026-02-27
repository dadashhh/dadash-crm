/**
 * Fonction unique d'écriture: upsert_spender_and_event
 * - Upsert spenders (clé = tg_user_id ou username/peer_id)
 * - Deep-merge meta (standard shape profile + enrich.last)
 * - Insert spender_events (new_spender | profile_updated | message)
 * - Idempotent via idempotency_key
 */
import { db } from '../supabaseClient.js';
import { log } from '../logger.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertSpenderAndEventPayload {
  tg_user_id?: string | number | null;
  username?: string | null;
  display_name?: string | null;
  extracted_fields?: Record<string, unknown>;
  message?: string | null;
  direction?: 'in' | 'out';
  conversation_id?: string | null;
  tg_message_id?: string | number | null;
  /** Pour enrich IA: "Fields: status.relation, language, notes_chatter" */
  enrich_fields_list?: string[];
  /** Patch brut de l'enrichissement */
  enrich_patch?: Record<string, unknown>;
}

export interface UpsertSpenderAndEventResult {
  spender_id: string;
  created: boolean;
  event_inserted: boolean;
  event_type: 'new_spender' | 'profile_updated' | 'message';
}

/** Normalise tg_user_id en string digits-only */
function normalizeTgUserId(val: string | number | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits ? digits : null;
}

/** SHA1-like hash simple pour idempotency (Node crypto si dispo) */
function hashIdempotency(input: string): string {
  try {
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(input).digest('hex').slice(0, 40);
  } catch {
    return Buffer.from(input).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  }
}

/** Construit meta.profile standard */
function buildProfileMeta(extracted: Record<string, unknown>): Record<string, unknown> {
  const profile: Record<string, unknown> = { identity: {}, status: {} };
  const identity = profile.identity as Record<string, unknown>;
  const status = profile.status as Record<string, unknown>;

  if (extracted.first_name != null && extracted.first_name !== '') identity.first_name = extracted.first_name;
  if (extracted.age != null && extracted.age !== '') identity.age = extracted.age;
  if (extracted.job != null && extracted.job !== '') profile.job = extracted.job;
  if (extracted.relationship_status != null && extracted.relationship_status !== '') status.relationship_status = extracted.relationship_status;
  if (extracted.langue != null && extracted.langue !== '') profile.language = extracted.langue;
  if (extracted.language != null && extracted.language !== '') profile.language = extracted.language;
  if (extracted.notes_chatter != null && extracted.notes_chatter !== '') profile.notes_chatter = extracted.notes_chatter;
  if (extracted.city != null && extracted.city !== '') {
    profile.location = { ...((profile.location as Record<string, unknown>) || {}), city: extracted.city };
  }
  if (extracted.country != null && extracted.country !== '') {
    const loc = (profile.location as Record<string, unknown>) || {};
    profile.location = { ...loc, country: extracted.country };
  }

  return profile;
}

/** Deep merge sans remplacer non-null par null */
function deepMergeNoNull(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (srcVal === null || srcVal === undefined || srcVal === '') continue;
    const tgtVal = result[key];
    if (
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      srcVal !== null &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMergeNoNull(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/** Construit meta enrich.last */
function buildEnrichLast(
  fields: string[],
  patch: Record<string, unknown>,
  ts: string,
): Record<string, unknown> {
  return {
    ts,
    fields: [...fields].sort(),
    patch: patch || {},
  };
}

/**
 * Fonction unique: upsert spender + event
 */
export async function upsertSpenderAndEvent(
  payload: UpsertSpenderAndEventPayload,
  supabase: SupabaseClient = db,
): Promise<UpsertSpenderAndEventResult> {
  const now = new Date().toISOString();
  const tgNorm = normalizeTgUserId(payload.tg_user_id);
  const username = payload.username?.replace(/^@/, '').trim() || null;
  const displayName = payload.display_name?.trim() || null;

  // Handle: @username ou tg_<id> ou peer_<conversation>
  const handle = username
    ? (username.startsWith('@') ? username : `@${username}`)
    : tgNorm
      ? `tg_${tgNorm}`
      : payload.conversation_id
        ? `peer_${payload.conversation_id.slice(0, 8)}`
        : 'unknown';

  const name = displayName || handle;

  const hasExtracted = payload.extracted_fields && Object.keys(payload.extracted_fields).length > 0;
  const hasEnrichFields = payload.enrich_fields_list && payload.enrich_fields_list.length > 0;

  // 2) Upsert spenders
  const metaBase: Record<string, unknown> = {
    last_seen: now,
    last_message: payload.message ? now : undefined,
    last_enrich: (hasExtracted || hasEnrichFields) ? now : undefined,
  };

  if (!tgNorm && (username || payload.conversation_id)) {
    metaBase.identity = { ...((metaBase.identity as Record<string, unknown>) || {}), tg_user_id_missing: true };
  }

  const profileMeta = buildProfileMeta((payload.extracted_fields || {}) as Record<string, unknown>);
  const enrichFields = payload.enrich_fields_list || (payload.extracted_fields ? Object.keys(payload.extracted_fields) : []);
  const enrichPatch = payload.enrich_patch || (payload.extracted_fields || {});

  if (enrichFields.length > 0) {
    metaBase.enrich = {
      last: buildEnrichLast(enrichFields, enrichPatch as Record<string, unknown>, now),
    };
  }

  const newMeta = {
    profile: {
      identity: profileMeta.identity || {},
      status: profileMeta.status || {},
      ...profileMeta,
    },
    ...metaBase,
  };

  let spenderId: string;
  let created = false;

  if (tgNorm) {
    // Upsert on tg_user_id
    const { data: existing } = await supabase
      .from('spenders')
      .select('id, meta')
      .eq('tg_user_id', tgNorm)
      .maybeSingle();

    if (existing) {
      const currentMeta = (existing.meta as Record<string, unknown>) || {};
      const merged = deepMergeNoNull(currentMeta, newMeta);
      const { error } = await supabase
        .from('spenders')
        .update({
          handle,
          display_name: displayName || null,
          name,
          meta: merged,
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) throw new Error(`upsertSpender update: ${error.message}`);
      spenderId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from('spenders')
        .insert({
          tg_user_id: tgNorm,
          handle,
          display_name: displayName || null,
          name,
          meta: newMeta,
          last_seen_at: now,
          updated_at: now,
          status: 'active',
          telegram_username: username,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') {
          const { data: retry } = await supabase.from('spenders').select('id').eq('tg_user_id', tgNorm).single();
          spenderId = retry!.id;
        } else throw new Error(`upsertSpender insert: ${error.message}`);
      } else {
        spenderId = inserted!.id;
        created = true;
      }
    }
  } else {
    // Upsert on handle (fallback)
    const { data: existing } = await supabase
      .from('spenders')
      .select('id, meta, display_name')
      .eq('handle', handle)
      .maybeSingle();

    if (existing) {
      const currentMeta = (existing.meta as Record<string, unknown>) || {};
      const merged = deepMergeNoNull(currentMeta, newMeta);
      const existingDisplayName = (existing as { display_name?: string }).display_name;
      const { error } = await supabase
        .from('spenders')
        .update({
          display_name: displayName || existingDisplayName,
          meta: merged,
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) throw new Error(`upsertSpender update: ${error.message}`);
      spenderId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from('spenders')
        .insert({
          handle,
          display_name: displayName || null,
          name,
          meta: newMeta,
          last_seen_at: now,
          updated_at: now,
          status: 'active',
          telegram_username: username,
        })
        .select('id')
        .single();
      if (error) {
        if (error.code === '23505') {
          const { data: retry } = await supabase.from('spenders').select('id').eq('handle', handle).single();
          spenderId = retry!.id;
        } else throw new Error(`upsertSpender insert: ${error.message}`);
      } else {
        spenderId = inserted!.id;
        created = true;
      }
    }
  }

  // Déterminer event_type après upsert
  let eventType: 'new_spender' | 'profile_updated' | 'message' = 'message';
  if (created) {
    eventType = 'new_spender';
  } else if (hasExtracted || hasEnrichFields) {
    eventType = 'profile_updated';
  } else if (payload.message !== undefined && payload.message !== null) {
    eventType = 'message';
  }

  log.info('UPSERT', 'spender ok', { spender_id: spenderId, tg_user_id: tgNorm ?? handle, created });

  // 3) Insert spender_events (idempotent)
  const tgForEvent = tgNorm || '0';
  let summary = '';
  let idempotencyKey = '';

  if (eventType === 'new_spender') {
    summary = 'new spender created';
    idempotencyKey = `spender:${tgForEvent}:created`;
  } else if (eventType === 'profile_updated') {
    const fieldsStr = enrichFields.join(', ');
    summary = `enriched: ${fieldsStr}`;
    const tsBucket = Math.floor(Date.now() / 60000).toString();
    idempotencyKey = hashIdempotency(`${tgForEvent}:${tsBucket}:${enrichFields.sort().join(',')}`);
  } else {
    const msgTrunc = (payload.message || '').slice(0, 100);
    summary = `${payload.direction === 'in' ? '[in]' : '[out]'} ${msgTrunc || 'Message'}`;
    const convId = payload.conversation_id || '';
    const msgId = String(payload.tg_message_id || '');
    idempotencyKey = convId && msgId ? hashIdempotency(`${convId}:${msgId}`) : `msg:${tgForEvent}:${Date.now()}`;
  }

  const eventData = {
    summary,
    fields: enrichFields,
    patch: enrichPatch,
    direction: payload.direction,
    message: payload.message?.slice(0, 200),
  };

  let eventInserted = false;
  const eventRow = {
    tg_user_id: tgForEvent,
    event_type: eventType,
    idempotency_key: idempotencyKey,
    data: eventData,
    spender_id: spenderId,
  };

  // Essayer insert direct (idempotent via ON CONFLICT côté DB ou catch 23505)
  const { error: insertErr } = await supabase.from('spender_events').insert(eventRow);
  if (!insertErr) {
    eventInserted = true;
  } else if (insertErr.code === '23505') {
    eventInserted = true; // doublon = idempotent ok
  } else {
    // Fallback: RPC fn_insert_spender_event (overload TEXT si migration 20260327 appliquée)
    try {
      const { error: rpcErr } = await supabase.rpc('fn_insert_spender_event', {
        p_tg_user_id: tgForEvent,
        p_event_type: eventType,
        p_idempotency_key: idempotencyKey,
        p_data: eventData,
      });
      if (!rpcErr) eventInserted = true;
    } catch {
      log.warn('EVENT', 'insert_skipped', { event_type: eventType, idempotency_key: idempotencyKey, err: insertErr.message });
    }
  }

  if (eventInserted) {
    log.info('EVENT', 'inserted', { type: eventType, fields: enrichFields.join(',') || '-' });
  }

  return { spender_id: spenderId, created, event_inserted: eventInserted, event_type: eventType };
}
