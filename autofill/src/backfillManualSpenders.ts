/**
 * ONE-SHOT: Backfill ALL manual spender cards from existing messages.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx src/backfillManualSpenders.ts
 *
 * This script:
 *   1) Links manual spenders to conversations (by username matching in tg_messages.meta)
 *   2) For each spender with a conversation, extracts profile from messages
 *   3) Updates top-level columns + meta directly
 *   4) No bot deployment needed — runs against Supabase directly
 */
import { createClient } from '@supabase/supabase-js';
import { extractProfile } from './profile/extractProfile.js';
import { structureExtractedProfile, flattenForEnrichmentRpc } from './utils/spenderHelpers.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Spender {
  id: string;
  tg_user_id: string | null;
  handle: string | null;
  telegram_username: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  job: string | null;
  langue: string | null;
  relationship_status: string | null;
  budget_range: string | null;
  first_name: string | null;
  notes: string | null;
  meta: Record<string, unknown> | null;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('BACKFILL MANUAL SPENDERS — ONE SHOT');
  console.log('═══════════════════════════════════════════');

  // Step 1: Backfill tg_conversations.username from tg_messages.meta
  console.log('\n[STEP 1] Backfilling tg_conversations.username from tg_messages.meta...');

  const { data: convsMissing } = await db
    .from('tg_conversations')
    .select('id')
    .or('username.is.null,username.eq.');

  if (convsMissing && convsMissing.length > 0) {
    let patched = 0;
    for (const conv of convsMissing) {
      const { data: firstMsg } = await db
        .from('tg_messages')
        .select('meta')
        .eq('conversation_id', conv.id)
        .eq('direction', 'in')
        .not('meta', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstMsg?.meta) {
        const meta = firstMsg.meta as Record<string, unknown>;
        const username = ((meta.username as string) || '').replace(/^@/, '').trim();
        const tgUserId = String(meta.tg_user_id || '').replace(/\D/g, '');
        const displayName = ((meta.display_name as string) || '').trim();

        const patch: Record<string, unknown> = {};
        if (username) patch.username = username;
        if (tgUserId) patch.tg_user_id = tgUserId;
        if (displayName) patch.display_name = displayName;

        if (Object.keys(patch).length > 0) {
          await db.from('tg_conversations').update(patch).eq('id', conv.id);
          patched++;
        }
      }
    }
    console.log(`  → Patched ${patched}/${convsMissing.length} conversations`);
  } else {
    console.log('  → All conversations already have usernames');
  }

  // Step 2: Get ALL spenders
  console.log('\n[STEP 2] Loading all spenders...');
  const { data: spenders, error: spErr } = await db
    .from('spenders')
    .select('id, tg_user_id, handle, telegram_username, age, city, country, job, langue, relationship_status, budget_range, first_name, notes, meta')
    .or('status.eq.active,is_active.eq.true')
    .order('updated_at', { ascending: false });

  if (spErr || !spenders) {
    console.error('Failed to load spenders:', spErr?.message);
    process.exit(1);
  }
  console.log(`  → ${spenders.length} spenders loaded`);

  // Step 3: Link manual spenders (no tg_user_id) to conversations
  console.log('\n[STEP 3] Linking manual spenders to conversations...');
  let linked = 0;
  const manualSpenders = spenders.filter(
    (s: Spender) => !s.tg_user_id || s.tg_user_id === '0' || s.tg_user_id === ''
  );
  console.log(`  → ${manualSpenders.length} spenders without tg_user_id`);

  for (const sp of manualSpenders) {
    const username = (sp.telegram_username || sp.handle || '').replace(/^@/, '').toLowerCase().trim();
    if (!username) continue;

    const { data: conv } = await db
      .from('tg_conversations')
      .select('id, tg_user_id, username')
      .or(`username.ilike.${username},username.ilike.@${username}`)
      .not('tg_user_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (conv && conv.tg_user_id) {
      await db.from('spenders').update({
        tg_user_id: String(conv.tg_user_id),
        updated_at: new Date().toISOString(),
      }).eq('id', sp.id);

      await db.from('tg_conversations').update({ spender_id: sp.id }).eq('id', conv.id);

      sp.tg_user_id = String(conv.tg_user_id);
      linked++;
      console.log(`  ✓ Linked @${username} → tg_user_id=${conv.tg_user_id}`);
    }
  }
  console.log(`  → Linked ${linked} manual spenders`);

  // Step 4: For each spender with a conversation, extract + fill
  console.log('\n[STEP 4] Extracting profiles and filling spender cards...');
  let updated = 0;
  let skipped = 0;
  let noMessages = 0;

  for (const sp of spenders as Spender[]) {
    // Find conversation for this spender
    let convId: string | null = null;

    if (sp.tg_user_id && sp.tg_user_id !== '0') {
      const { data: conv } = await db
        .from('tg_conversations')
        .select('id')
        .eq('tg_user_id', sp.tg_user_id)
        .limit(1)
        .maybeSingle();
      convId = conv?.id || null;
    }

    if (!convId) {
      const { data: conv } = await db
        .from('tg_conversations')
        .select('id')
        .eq('spender_id', sp.id)
        .limit(1)
        .maybeSingle();
      convId = conv?.id || null;
    }

    if (!convId) {
      const username = (sp.telegram_username || sp.handle || '').replace(/^@/, '').toLowerCase().trim();
      if (username) {
        const { data: conv } = await db
          .from('tg_conversations')
          .select('id')
          .or(`username.ilike.${username},username.ilike.@${username}`)
          .limit(1)
          .maybeSingle();
        convId = conv?.id || null;
      }
    }

    if (!convId) {
      skipped++;
      continue;
    }

    // Load messages
    const { data: messages } = await db
      .from('tg_messages')
      .select('text, direction')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      noMessages++;
      continue;
    }

    // Extract profile using the real heuristic extractor
    const profile = extractProfile(messages as { text: string | null; direction: string }[]);
    if (Object.keys(profile).length === 0) {
      skipped++;
      continue;
    }

    const structured = structureExtractedProfile(profile as Record<string, unknown>);
    const flat = flattenForEnrichmentRpc(structured as Record<string, unknown>);

    if (Object.keys(flat).length === 0) {
      skipped++;
      continue;
    }

    // Build update: only fill empty columns
    const patch: Record<string, unknown> = {};
    if (flat.age && !sp.age) patch.age = typeof flat.age === 'string' ? parseInt(flat.age as string, 10) : flat.age;
    if (flat.first_name && !sp.first_name) patch.first_name = flat.first_name;
    if (flat.city && !sp.city) patch.city = flat.city;
    if (flat.country && !sp.country) patch.country = flat.country;
    if (flat.job && (!sp.job || sp.job.trim() === '')) patch.job = flat.job;
    if (flat.language && (!sp.langue || sp.langue.trim() === '')) patch.langue = flat.language;
    if (flat.relationship_status && (!sp.relationship_status || sp.relationship_status.trim() === '')) patch.relationship_status = flat.relationship_status;
    if (flat.budget_range && (!sp.budget_range || sp.budget_range.trim() === '')) patch.budget_range = flat.budget_range;
    if (flat.notes && (!sp.notes || sp.notes.trim() === '')) patch.notes = flat.notes;

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    // Update meta.profile too
    const currentMeta = (sp.meta || {}) as Record<string, unknown>;
    const currentProfile = (currentMeta.profile || {}) as Record<string, unknown>;
    const newProfile = {
      ...currentProfile,
      ...structured,
      identity: { ...((currentProfile.identity as Record<string, unknown>) || {}), ...((structured.identity as Record<string, unknown>) || {}) },
      location: { ...((currentProfile.location as Record<string, unknown>) || {}), ...((structured.location as Record<string, unknown>) || {}) },
    };

    patch.meta = {
      ...currentMeta,
      profile: newProfile,
      last_enrich: new Date().toISOString(),
      last_enrich_source: 'backfill_manual_spenders',
    };
    patch.updated_at = new Date().toISOString();

    const { error: updateErr } = await db.from('spenders').update(patch).eq('id', sp.id);
    if (updateErr) {
      console.error(`  ✗ ${sp.handle || sp.id}: ${updateErr.message}`);
    } else {
      updated++;
      const fields = Object.keys(patch).filter(k => k !== 'meta' && k !== 'updated_at');
      console.log(`  ✓ ${sp.handle || sp.telegram_username || sp.id}: ${fields.join(', ')}`);
    }

    // Also call fn_apply_spender_enrichment if tg_user_id exists
    if (sp.tg_user_id && sp.tg_user_id !== '0') {
      try {
        await db.rpc('fn_apply_spender_enrichment', {
          p_spender_id: sp.id,
          p_tg_user_id: sp.tg_user_id,
          p_enrichment: flat,
        });
      } catch {
        // Best effort
      }
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('RESULTS:');
  console.log(`  Updated:     ${updated}`);
  console.log(`  Skipped:     ${skipped} (no new data to extract)`);
  console.log(`  No messages: ${noMessages}`);
  console.log(`  Linked:      ${linked} (manual → tg_user_id)`);
  console.log(`  Total:       ${spenders.length}`);
  console.log('═══════════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
