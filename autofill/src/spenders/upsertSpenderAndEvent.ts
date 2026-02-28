/**
 * Unified write: upsert_spender_and_event
 * - Upsert spenders (key = tg_user_id, then fallback to telegram_username/handle)
 * - Deep-merge meta (profile + enrich.last) — never wipe manual notes/tags
 * - Insert spender_events (new_spender | profile_updated | message)
 * - Link spender_id back to tg_conversations
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
  enrich_fields_list?: string[];
  enrich_patch?: Record<string, unknown>;
}

export interface UpsertSpenderAndEventResult {
  spender_id: string;
  created: boolean;
  event_inserted: boolean;
  event_type: 'new_spender' | 'profile_updated' | 'message';
}

function normalizeTgUserId(val: string | number | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits || null;
}

function hashIdempotency(input: string): string {
  try {
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(input).digest('hex').slice(0, 40);
  } catch {
    return Buffer.from(input).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  }
}

function buildProfileMeta(extracted: Record<string, unknown>): Record<string, unknown> {
  const profile: Record<string, unknown> = { identity: {}, status: {} };
  const identity = profile.identity as Record<string, unknown>;
  const status = profile.status as Record<string, unknown>;

  if (extracted.first_name != null && extracted.first_name !== '') identity.first_name = extracted.first_name;
  if (extracted.age != null && extracted.age !== '') identity.age = extracted.age;
  if (extracted.job != null && extracted.job !== '') profile.job = extracted.job;
  if (extracted.relationship_status != null && extracted.relationship_status !== '') {
    status.relationship_status = extracted.relationship_status;
    status.relation = extracted.relationship_status;
    profile.relationship_status = extracted.relationship_status;
  }
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

function buildEnrichLast(
  fields: string[],
  patch: Record<string, unknown>,
  ts: string,
): Record<string, unknown> {
  return { ts, fields: [...fields].sort(), patch: patch || {} };
}

/**
 * Build top-level column updates from extracted_fields.
 * Uses COALESCE-style logic: only returns non-empty values,
 * caller should merge with existing values to avoid overwrites.
 */
function buildTopLevelColumns(extracted: Record<string, unknown>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (extracted.first_name && extracted.first_name !== '') cols.first_name = extracted.first_name;
  if (extracted.age != null && extracted.age !== '') cols.age = typeof extracted.age === 'string' ? parseInt(extracted.age as string, 10) : extracted.age;
  if (extracted.job && extracted.job !== '') cols.job = extracted.job;
  if (extracted.city && extracted.city !== '') cols.city = extracted.city;
  if (extracted.country && extracted.country !== '') cols.country = extracted.country;
  if (extracted.language && extracted.language !== '') cols.langue = extracted.language;
  if (extracted.langue && extracted.langue !== '') cols.langue = extracted.langue;
  if (extracted.notes && extracted.notes !== '') cols.notes = extracted.notes;
  if (extracted.notes_chatter && extracted.notes_chatter !== '') cols.notes = extracted.notes_chatter;
  if (extracted.relationship_status && extracted.relationship_status !== '') cols.relationship_status = extracted.relationship_status;
  if (extracted.budget_range && extracted.budget_range !== '') cols.budget_range = extracted.budget_range;
  if (extracted.whatsapp_phone && extracted.whatsapp_phone !== '') cols.whatsapp_phone = extracted.whatsapp_phone;
  return cols;
}

/**
 * Try to find an existing spender created manually by username/handle.
 * Only matches spenders that don't already have a tg_user_id set.
 */
async function findManualSpender(
  supabase: SupabaseClient,
  username: string | null,
): Promise<{ id: string; meta: Record<string, unknown> } | null> {
  if (!username) return null;

  const clean = username.replace(/^@/, '').toLowerCase();
  if (!clean) return null;

  // Try NULL tg_user_id first (standard manual spender)
  const { data } = await supabase
    .from('spenders')
    .select('id, meta')
    .is('tg_user_id', null)
    .or(`telegram_username.ilike.${clean},handle.ilike.${clean},handle.ilike.@${clean}`)
    .limit(1)
    .maybeSingle();

  if (data) return { id: data.id, meta: (data.meta as Record<string, unknown>) || {} };

  // Fallback: tg_user_id might be '0' or '' instead of NULL
  const { data: fallback } = await supabase
    .from('spenders')
    .select('id, meta, tg_user_id')
    .or(`telegram_username.ilike.${clean},handle.ilike.${clean},handle.ilike.@${clean}`)
    .in('tg_user_id', ['0', ''])
    .limit(1)
    .maybeSingle();

  return fallback ? { id: fallback.id, meta: (fallback.meta as Record<string, unknown>) || {} } : null;
}

export async function upsertSpenderAndEvent(
  payload: UpsertSpenderAndEventPayload,
  supabase: SupabaseClient = db,
): Promise<UpsertSpenderAndEventResult> {
  const now = new Date().toISOString();
  const tgNorm = normalizeTgUserId(payload.tg_user_id);
  const username = payload.username?.replace(/^@/, '').trim() || null;
  const displayName = payload.display_name?.trim() || null;

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
    // --- Primary lookup: tg_user_id ---
    const { data: existing } = await supabase
      .from('spenders')
      .select('id, meta')
      .eq('tg_user_id', tgNorm)
      .maybeSingle();

    if (existing) {
      const currentMeta = (existing.meta as Record<string, unknown>) || {};
      const merged = deepMergeNoNull(currentMeta, newMeta);
      const topLevelCols = hasExtracted ? buildTopLevelColumns(payload.extracted_fields!) : {};
      const { error } = await supabase
        .from('spenders')
        .update({
          handle,
          display_name: displayName || null,
          name,
          meta: merged,
          last_seen_at: now,
          updated_at: now,
          ...topLevelCols,
        })
        .eq('id', existing.id);
      if (error) throw new Error(`upsertSpender update: ${error.message}`);
      spenderId = existing.id;
    } else {
      // Before creating, check for manual spender by username
      const manual = await findManualSpender(supabase, username);
      if (manual) {
        const merged = deepMergeNoNull(manual.meta, newMeta);
        const topLevelCols = hasExtracted ? buildTopLevelColumns(payload.extracted_fields!) : {};
        const { error } = await supabase
          .from('spenders')
          .update({
            tg_user_id: tgNorm,
            handle,
            display_name: displayName || null,
            name,
            telegram_username: username,
            meta: merged,
            last_seen_at: now,
            updated_at: now,
            ...topLevelCols,
          })
          .eq('id', manual.id);
        if (error) throw new Error(`upsertSpender link-manual: ${error.message}`);
        spenderId = manual.id;
        log.info('SPENDER', 'linked_manual', { spender_id: spenderId, tg_user_id: tgNorm, username });
      } else {
        const topLevelCols = hasExtracted ? buildTopLevelColumns(payload.extracted_fields!) : {};
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
            ...topLevelCols,
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
    }
  } else {
    // --- Fallback: handle-based lookup ---
    const handleClean = handle.replace(/^@/, '');
    const { data: existing } = await supabase
      .from('spenders')
      .select('id, meta, display_name')
      .or(`handle.eq.${handle},handle.eq.${handleClean},telegram_username.ilike.${handleClean}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const currentMeta = (existing.meta as Record<string, unknown>) || {};
      const merged = deepMergeNoNull(currentMeta, newMeta);
      const existingDisplayName = (existing as { display_name?: string }).display_name;
      const topLevelCols = hasExtracted ? buildTopLevelColumns(payload.extracted_fields!) : {};
      const { error } = await supabase
        .from('spenders')
        .update({
          display_name: displayName || existingDisplayName,
          meta: merged,
          last_seen_at: now,
          updated_at: now,
          ...topLevelCols,
        })
        .eq('id', existing.id);
      if (error) throw new Error(`upsertSpender update: ${error.message}`);
      spenderId = existing.id;
    } else {
      const topLevelCols = hasExtracted ? buildTopLevelColumns(payload.extracted_fields!) : {};
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
          ...topLevelCols,
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

  // ── Link spender_id to tg_conversations ──
  if (payload.conversation_id) {
    try {
      await supabase
        .from('tg_conversations')
        .update({ spender_id: spenderId })
        .eq('id', payload.conversation_id)
        .is('spender_id', null);
    } catch (err) {
      log.warn('SPENDER', 'conv_link_failed', {
        conv_id: payload.conversation_id,
        spender_id: spenderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Determine event_type ──
  let eventType: 'new_spender' | 'profile_updated' | 'message' = 'message';
  if (created) {
    eventType = 'new_spender';
  } else if (hasExtracted || hasEnrichFields) {
    eventType = 'profile_updated';
  } else if (payload.message !== undefined && payload.message !== null) {
    eventType = 'message';
  }

  log.info('UPSERT', 'spender ok', { spender_id: spenderId, tg_user_id: tgNorm ?? handle, created });

  // ── Insert spender_events (idempotent) ──
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

  const { error: insertErr } = await supabase.from('spender_events').insert(eventRow);
  if (!insertErr) {
    eventInserted = true;
  } else if (insertErr.code === '23505') {
    eventInserted = true;
  } else {
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
