#!/usr/bin/env npx tsx
/**
 * Script test manuel: simuler un enrichment payload et vérifier DB
 * Usage: npx tsx scripts/test-enrichment-manual.ts
 *
 * Vérifie:
 * - spenders.meta contient profile + enrich.last
 * - spender_events contient une ligne profile_updated avec summary détaillé
 */
import { db } from '../src/supabaseClient.js';
import { upsertSpenderAndEvent } from '../src/spenders/upsertSpenderAndEvent.js';

const TEST_TG_USER_ID = '999888777'; // ID de test
const TEST_USERNAME = 'test_enrich_user';

async function main() {
  console.log('=== Test manuel enrichment ===\n');

  // 1) Simuler un payload d'enrichissement (comme l'IA renverrait)
  const payload = {
    tg_user_id: TEST_TG_USER_ID,
    username: TEST_USERNAME,
    display_name: 'Test Enrich User',
    extracted_fields: {
      age: 28,
      job: 'Developer',
      relationship_status: 'single',
      language: 'FR',
      notes_chatter: 'Client intéressé par premium',
      city: 'Paris',
      country: 'France',
    },
    enrich_fields_list: ['status.relation', 'language', 'notes_chatter', 'age', 'job', 'city', 'country'],
    enrich_patch: {
      age: 28,
      job: 'Developer',
      relationship_status: 'single',
      language: 'FR',
      notes_chatter: 'Client intéressé par premium',
      city: 'Paris',
      country: 'France',
    },
  };

  console.log('1) Appel upsert_spender_and_event avec payload:', JSON.stringify(payload, null, 2).slice(0, 500) + '...\n');

  const result = await upsertSpenderAndEvent(payload);
  console.log('2) Résultat:', result);
  console.log('');

  // 3) Vérifier spenders.meta
  const { data: spender, error: spErr } = await db
    .from('spenders')
    .select('id, meta, handle, display_name')
    .eq('tg_user_id', TEST_TG_USER_ID)
    .maybeSingle();

  if (spErr) {
    console.error('Erreur lecture spender:', spErr.message);
    process.exit(1);
  }

  if (!spender) {
    console.error('Spender non trouvé (tg_user_id=' + TEST_TG_USER_ID + ')');
    process.exit(1);
  }

  console.log('3) Spender trouvé:', { id: spender.id, handle: spender.handle, display_name: spender.display_name });
  const meta = spender.meta as Record<string, unknown>;
  console.log('   meta.profile:', JSON.stringify(meta?.profile, null, 2));
  console.log('   meta.enrich:', JSON.stringify(meta?.enrich, null, 2));
  console.log('   meta.last_seen:', meta?.last_seen);
  console.log('');

  const hasProfile = meta?.profile && typeof meta.profile === 'object';
  const hasEnrichLast = meta?.enrich && typeof meta.enrich === 'object' && (meta.enrich as Record<string, unknown>)?.last;
  if (!hasProfile) console.warn('⚠ meta.profile manquant ou invalide');
  if (!hasEnrichLast) console.warn('⚠ meta.enrich.last manquant');

  // 4) Vérifier spender_events
  const { data: events, error: evErr } = await db
    .from('spender_events')
    .select('id, event_type, data, created_at')
    .eq('tg_user_id', TEST_TG_USER_ID)
    .eq('event_type', 'profile_updated')
    .order('created_at', { ascending: false })
    .limit(3);

  if (evErr) {
    console.error('Erreur lecture events:', evErr.message);
    process.exit(1);
  }

  console.log('4) spender_events profile_updated:', events?.length ?? 0, 'ligne(s)');
  if (events && events.length > 0) {
    const last = events[0];
    const data = last.data as Record<string, unknown>;
    console.log('   Dernier event:', {
      id: last.id,
      summary: data?.summary,
      fields: data?.fields,
      created_at: last.created_at,
    });
    if (!data?.summary || !String(data.summary).includes('enriched:')) {
      console.warn('⚠ summary attendu "enriched: field1, field2..."');
    }
  } else {
    console.warn('⚠ Aucun event profile_updated trouvé');
  }

  console.log('\n=== Fin test ===');
  if (hasProfile && hasEnrichLast && events && events.length > 0) {
    console.log('OK: spenders.meta et spender_events conformes.');
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
