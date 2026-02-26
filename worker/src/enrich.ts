// ─────────────────────────────────────────────
// Enrich Worker: spender_enrich_queue → extract profile → upsert spenders
// ─────────────────────────────────────────────
import { db } from './db.js';
import { sendMessage } from './telegram.js';

const POLL_INTERVAL_MS = parseInt(process.env.ENRICH_POLL_MS ?? '10000', 10);
const MAX_ATTEMPTS = 3;
const WORKER_ID = `enrich-${process.pid}-${Date.now().toString(36)}`;
const MANAGER_TG_CHAT_ID = process.env.MANAGER_TG_CHAT_ID || '';

export interface EnrichMetrics {
  processed: number;
  errors: number;
  lastPollAt: string | null;
  running: boolean;
}

export const enrichMetrics: EnrichMetrics = {
  processed: 0,
  errors: 0,
  lastPollAt: null,
  running: false,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface QueueRow {
  id: string;
  conversation_id: string;
  tg_chat_id: string;
  spender_id: string | null;
  status: string;
  attempts: number;
  last_message_id: string | null;
}

interface TgMessage {
  id: string;
  text: string | null;
  direction: string;
  created_at: string;
  meta: Record<string, unknown>;
}

interface ExtractedProfile {
  first_name?: string;
  age?: number;
  city?: string;
  country?: string;
  job?: string;
  langue?: string;
  preferences?: string;
  personality_notes?: string;
  relationship_status?: string;
  budget_range?: string;
}

function extractProfile(messages: TgMessage[]): ExtractedProfile {
  const profile: ExtractedProfile = {};
  const allText = messages.map((m) => m.text || '').join('\n');

  const nameMatch = allText.match(
    /(?:je m'appelle|my name is|i'm|name[:\s]+)[\s]*([A-Z][a-zéèêë]+)/i,
  );
  if (nameMatch) profile.first_name = nameMatch[1];

  const ageMatch = allText.match(
    /(?:j'ai|i am|i'm|age[:\s]+)[\s]*(\d{1,2})[\s]*(?:ans|years|yo)/i,
  );
  if (ageMatch) profile.age = parseInt(ageMatch[1], 10);

  const cityMatch = allText.match(
    /(?:j'habite|i live in|from|city[:\s]+)[\s]*([A-Z][a-zéèêë]+)/i,
  );
  if (cityMatch) profile.city = cityMatch[1];

  const countryMatch = allText.match(
    /(?:country[:\s]+|pays[:\s]+)[\s]*([A-Z][a-zéèêë]+)/i,
  );
  if (countryMatch) profile.country = countryMatch[1];

  const jobMatch = allText.match(
    /(?:je suis|i work as|job[:\s]+|métier[:\s]+)[\s]*([A-Za-zéèêëàâ\s]+?)(?:\.|,|\n|$)/i,
  );
  if (jobMatch && jobMatch[1].length < 50) profile.job = jobMatch[1].trim();

  const langPatterns = [
    { re: /(?:french|français|francais)/i, val: 'FR' },
    { re: /(?:english|anglais)/i, val: 'EN' },
    { re: /(?:german|deutsch|allemand)/i, val: 'DE' },
    { re: /(?:russian|russe|русский)/i, val: 'RU' },
    { re: /(?:spanish|espagnol|español)/i, val: 'ES' },
    { re: /(?:arabic|arabe)/i, val: 'AR' },
  ];
  for (const lp of langPatterns) {
    if (lp.re.test(allText)) {
      profile.langue = lp.val;
      break;
    }
  }

  return profile;
}

function deepMergeProfile(
  existing: Record<string, unknown>,
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(extracted)) {
    if (value === undefined || value === null || value === '') continue;
    if (!merged[key] || merged[key] === '' || merged[key] === null) {
      merged[key] = value;
    }
  }
  return merged;
}

async function processOne(row: QueueRow): Promise<void> {
  console.log(`[ENRICH] Processing queue ${row.id} (conv=${row.conversation_id})`);

  const { data: messages, error: msgErr } = await db
    .from('tg_messages')
    .select('id, text, direction, created_at, meta')
    .eq('conversation_id', row.conversation_id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (msgErr) {
    throw new Error(`tg_messages fetch error: ${msgErr.message}`);
  }

  if (!messages || messages.length === 0) {
    console.log(`[ENRICH] No messages for conv ${row.conversation_id}, marking done`);
    await db
      .from('spender_enrich_queue')
      .update({ status: 'done', last_error: 'no messages', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return;
  }

  const incomingMessages = messages.filter((m: TgMessage) => m.direction === 'in');
  const profile = extractProfile(incomingMessages);
  const updatedFields = Object.keys(profile).filter(
    (k) => profile[k as keyof ExtractedProfile] !== undefined,
  );

  console.log(`[ENRICH] Extracted profile fields: ${updatedFields.join(', ') || 'none'}`);

  if (updatedFields.length === 0) {
    await db
      .from('spender_enrich_queue')
      .update({
        status: 'done',
        last_message_id: messages[messages.length - 1].id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return;
  }

  let spenderId = row.spender_id;
  let isNewSpender = false;

  if (!spenderId) {
    const { data: conv } = await db
      .from('tg_conversations')
      .select('spender_id, tg_chat_id')
      .eq('id', row.conversation_id)
      .single();

    if (conv?.spender_id) {
      spenderId = conv.spender_id;
    } else {
      const handle = row.tg_chat_id;
      const { data: existing } = await db
        .from('spenders')
        .select('id')
        .or(`handle.eq.${handle},telegram_username.eq.${handle},tg_user_id.eq.${handle}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        spenderId = existing.id;
      } else {
        const { data: inserted, error: insErr } = await db
          .from('spenders')
          .insert({
            handle,
            name: profile.first_name || handle,
            status: 'active',
            classification: 'new',
            ...(profile.langue ? { langue: profile.langue } : {}),
          })
          .select('id')
          .single();

        if (insErr) throw new Error(`spender insert: ${insErr.message}`);
        spenderId = inserted.id;
        isNewSpender = true;
        console.log(`[UPSERT] New spender created: ${spenderId} (handle=${handle})`);
      }

      if (spenderId) {
        await db
          .from('tg_conversations')
          .update({ spender_id: spenderId })
          .eq('id', row.conversation_id);
      }
    }
  }

  if (spenderId) {
    const { data: spender } = await db
      .from('spenders')
      .select('meta')
      .eq('id', spenderId)
      .single();

    const existingMeta = (spender?.meta as Record<string, unknown>) || {};
    const existingProfile = (existingMeta.profile as Record<string, unknown>) || {};
    const mergedProfile = deepMergeProfile(existingProfile, profile as unknown as Record<string, unknown>);

    const updates: Record<string, unknown> = {
      meta: { ...existingMeta, profile: mergedProfile },
    };
    if (profile.first_name && !spender?.meta) {
      updates.first_name = profile.first_name;
    }
    if (profile.city) updates.city = profile.city;
    if (profile.country) updates.country = profile.country;
    if (profile.job) updates.job = profile.job;
    if (profile.langue) updates.langue = profile.langue;
    if (profile.age) updates.age = profile.age;

    const { error: upErr } = await db.from('spenders').update(updates).eq('id', spenderId);

    if (upErr) throw new Error(`spender update: ${upErr.message}`);
    console.log(`[UPSERT] Spender ${spenderId} updated: ${updatedFields.join(', ')}`);

    const eventType = isNewSpender ? 'new_spender' : 'profile_updated';
    try {
      await db.from('spender_events').insert({
        spender_id: spenderId,
        spender_handle: row.tg_chat_id,
        event_type: eventType,
        message: isNewSpender
          ? `Nouveau spender créé via TG: ${profile.first_name || row.tg_chat_id}`
          : `Profil enrichi: ${updatedFields.join(', ')}`,
        meta: { updated_fields: updatedFields, profile },
      });
    } catch {
      console.warn('[ENRICH] spender_events insert failed (table may not exist)');
    }

    if (MANAGER_TG_CHAT_ID) {
      try {
        const emoji = isNewSpender ? '🆕' : '🔄';
        const title = isNewSpender ? 'Nouveau spender' : 'Profil enrichi';
        const details = updatedFields
          .map((f) => `${f}: ${profile[f as keyof ExtractedProfile]}`)
          .join('\n');
        const text = `${emoji} <b>${title}</b>\nChat: ${row.tg_chat_id}\n${details}`;
        await sendMessage(MANAGER_TG_CHAT_ID, text);
        console.log(`[TG] sent ${eventType} notification to manager`);
      } catch (e) {
        console.warn(`[TG] Failed to notify manager: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  await db
    .from('spender_enrich_queue')
    .update({
      status: 'done',
      spender_id: spenderId,
      last_message_id: messages[messages.length - 1].id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  enrichMetrics.processed++;
  console.log(`[QUEUE] Done: ${row.id}`);
}

async function pollOnce(): Promise<void> {
  const { data: row, error } = await db
    .from('spender_enrich_queue')
    .update({
      status: 'processing',
      locked_at: new Date().toISOString(),
      locked_by: WORKER_ID,
    })
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[ENRICH] Queue poll error:', error.message);
    return;
  }

  if (!row) return;

  try {
    await processOne(row as QueueRow);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const attempts = (row.attempts ?? 0) + 1;
    const newStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';

    await db
      .from('spender_enrich_queue')
      .update({
        status: newStatus,
        attempts,
        last_error: msg,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    enrichMetrics.errors++;
    console.error(`[ENRICH] Error processing ${row.id}: ${msg} (attempt ${attempts}/${MAX_ATTEMPTS} → ${newStatus})`);
  }
}

export async function startEnrichPoller(): Promise<void> {
  const hasTable = await db
    .from('spender_enrich_queue')
    .select('id')
    .limit(1)
    .then(({ error }) => !error);

  if (!hasTable) {
    console.warn('[ENRICH] spender_enrich_queue table not found — skipping enrich poller');
    return;
  }

  enrichMetrics.running = true;
  console.log(`[ENRICH] Started (interval=${POLL_INTERVAL_MS}ms, worker=${WORKER_ID})`);

  while (true) {
    enrichMetrics.lastPollAt = new Date().toISOString();
    try {
      await pollOnce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ENRICH] Unexpected error:', msg);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
