/**
 * Spender pipeline helpers — idempotent, normalized events, deep-merge sans écraser par vide.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { deepMerge } from './deepMerge.js';

/** Alias: deep merge sans écraser les champs non vides par du vide (null/undefined/'') */
export function deepMergeNoEmpty<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  return deepMerge(target, source);
}

/**
 * Détecte les champs nouvellement remplis (présents dans after, absents ou vides dans before).
 * Retourne la liste des noms de champs ajoutés/modifiés.
 */
export function diffAddedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const added: string[] = [];
  for (const key of Object.keys(after)) {
    const afterVal = after[key];
    if (afterVal === null || afterVal === undefined || afterVal === '') continue;
    const beforeVal = before[key];
    if (beforeVal === null || beforeVal === undefined || beforeVal === '') {
      added.push(key);
      continue;
    }
    if (typeof afterVal === 'object' && !Array.isArray(afterVal) && afterVal !== null &&
        typeof beforeVal === 'object' && !Array.isArray(beforeVal) && beforeVal !== null) {
      const nested = diffAddedFields(beforeVal as Record<string, unknown>, afterVal as Record<string, unknown>);
      if (nested.length > 0) added.push(key);
    } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      added.push(key);
    }
  }
  return added;
}

/** Payload minimal pour event (avant/après) */
export function minimalSnapshot(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      out[k] = obj[k];
    }
  }
  return out;
}

export interface WriteSpenderEventParams {
  tgUserId: number;
  eventType: 'new_spender' | 'profile_updated' | 'message';
  idempotencyKey: string;
  summary: string;
  payload?: Record<string, unknown>;
}

/**
 * Écrit un spender_event normalisé (event_type ∈ { new_spender, profile_updated, message }).
 * Idempotent via fn_insert_spender_event (ON CONFLICT DO NOTHING).
 */
export async function writeSpenderEvent(
  db: SupabaseClient,
  params: WriteSpenderEventParams,
): Promise<void> {
  const { tgUserId, eventType, idempotencyKey, summary, payload = {} } = params;
  const data = { summary, ...payload };
  const { error } = await db.rpc('fn_insert_spender_event', {
    p_tg_user_id: tgUserId,
    p_event_type: eventType,
    p_idempotency_key: idempotencyKey,
    p_data: data,
  });
  if (error) throw new Error(`writeSpenderEvent: ${error.message}`);
}

/**
 * Structure le profil extrait (extractProfile) pour meta.profile.
 * Convention: identity, location, status, language.
 */
export function structureExtractedProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (profile.age !== undefined && profile.age !== null && profile.age !== '') {
    out.identity = { ...((out.identity as Record<string, unknown>) || {}), age: profile.age };
  }
  if (profile.city || profile.country || profile.timezone) {
    const loc = (out.location as Record<string, unknown>) || {};
    out.location = {
      ...loc,
      ...(profile.city ? { city: profile.city } : {}),
      ...(profile.country ? { country: profile.country } : {}),
      ...(profile.timezone ? { timezone: profile.timezone } : {}),
    };
  }
  if (profile.langue || profile.language) {
    out.language = profile.langue || profile.language;
  }
  if (profile.relationship_status) {
    out.status = { ...((out.status as Record<string, unknown>) || {}), relation: profile.relationship_status };
  }
  if (profile.job) out.job = profile.job;
  if (profile.budget_range) out.budget_range = profile.budget_range;
  if (profile.interests && Array.isArray(profile.interests)) out.interests = profile.interests;
  return out;
}
