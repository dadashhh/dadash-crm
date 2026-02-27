import { createHash } from 'node:crypto';
import { db } from '../supabaseClient.js';
import { log, type LogMeta } from '../logger.js';
import { extractProfile } from '../profile/extractProfile.js';
import { deepMergeNoEmpty, diffAddedFields, writeSpenderEvent, structureExtractedProfile } from '../utils/spenderHelpers.js';

const POLL_MS = parseInt(process.env.ENRICH_POLL_MS ?? '5000', 10);
const BATCH_LIMIT = parseInt(process.env.ENRICH_BATCH_LIMIT ?? '1', 10);
const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;

export interface EnrichMetrics {
  enriched_ok: number;
  enriched_fail: number;
  queue_locked: number;
  queue_empty: number;
  running: boolean;
  lastPollAt: string | null;
}

export const metrics: EnrichMetrics = {
  enriched_ok: 0,
  enriched_fail: 0,
  queue_locked: 0,
  queue_empty: 0,
  running: false,
  lastPollAt: null,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface QueueRow {
  id: string;
  conversation_id: string;
  tg_user_id: number;
  last_message_id: number | null;
  attempts: number;
}

async function claimJob(): Promise<QueueRow | null> {
  const { data, error } = await db.rpc('fn_claim_enrich_job', {
    p_worker_id: WORKER_ID,
  });

  if (error) {
    log.error('ENRICH', 'claim_rpc_error', { error: error.message });
    return null;
  }

  const rows = data as QueueRow[] | null;
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function completeJob(jobId: string, status: 'done' | 'failed', errMsg?: string) {
  const { error } = await db.rpc('fn_complete_enrich_job', {
    p_job_id: jobId,
    p_status: status,
    p_error: errMsg ?? null,
  });
  if (error) {
    log.error('ENRICH', 'complete_rpc_error', { job_id: jobId, error: error.message });
  }
}

function profileHash(fields: string[], lastMessageId: number | null): string {
  const input = [...fields.sort(), String(lastMessageId ?? 0)].join(':');
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

async function processJob(job: QueueRow): Promise<void> {
  const ctx: LogMeta = {
    conv_id: job.conversation_id,
    tg_user_id: job.tg_user_id,
    job_id: job.id,
  };

  log.info('ENRICH', 'locked', ctx);
  metrics.queue_locked++;

  // A) Load messages from the conversation
  const { data: messages, error: msgErr } = await db
    .from('tg_messages')
    .select('text, direction, tg_message_id, created_at')
    .eq('conversation_id', job.conversation_id)
    .order('created_at', { ascending: true });

  if (msgErr) {
    log.error('ENRICH', 'load_messages_failed', { ...ctx, error: msgErr.message });
    await completeJob(job.id, 'failed', `load_messages: ${msgErr.message}`);
    metrics.enriched_fail++;
    return;
  }

  if (!messages || messages.length === 0) {
    log.warn('ENRICH', 'no_messages', ctx);
    await completeJob(job.id, 'done');
    metrics.enriched_ok++;
    return;
  }

  // B) Extract profile from message texts
  const profile = extractProfile(messages);
  const structuredProfile = structureExtractedProfile(profile as Record<string, unknown>);
  const updatedFields = Object.keys(structuredProfile);

  if (updatedFields.length === 0) {
    log.info('ENRICH', 'no_new_fields', ctx);
    await completeJob(job.id, 'done');
    metrics.enriched_ok++;
    return;
  }

  // C) Load current spender meta
  const { data: spender, error: spErr } = await db
    .from('spenders')
    .select('id, meta')
    .eq('tg_user_id', job.tg_user_id)
    .maybeSingle();

  if (spErr || !spender) {
    log.error('ENRICH', 'spender_not_found', { ...ctx, error: spErr?.message ?? 'null' });
    await completeJob(job.id, 'failed', 'spender_not_found');
    metrics.enriched_fail++;
    return;
  }

  // D) Deep merge snapshot: spenders.meta.profile (structure identity/location/status)
  const currentMeta = (spender.meta ?? {}) as Record<string, unknown>;
  const currentProfile = (currentMeta.profile ?? {}) as Record<string, unknown>;
  const mergedProfile = deepMergeNoEmpty(currentProfile, structuredProfile);

  const newMeta = deepMergeNoEmpty(currentMeta, { profile: mergedProfile });

  // Detect actually new/changed fields (nested keys flattened for summary)
  const changedFields = diffAddedFields(currentProfile, mergedProfile);

  // E) Write spender update
  const topLevelUpdates: Record<string, unknown> = { meta: newMeta };
  if (profile.age !== undefined && profile.age !== currentProfile.age) topLevelUpdates.age = profile.age;
  if (profile.city && profile.city !== currentProfile.city) topLevelUpdates.city = profile.city;
  if (profile.country && profile.country !== currentProfile.country) topLevelUpdates.country = profile.country;
  if (profile.job && profile.job !== currentProfile.job) topLevelUpdates.job = profile.job;

  const { error: updErr } = await db
    .from('spenders')
    .update(topLevelUpdates)
    .eq('id', spender.id);

  if (updErr) {
    log.error('ENRICH', 'spender_update_failed', { ...ctx, error: updErr.message });
    await completeJob(job.id, 'failed', `spender_update: ${updErr.message}`);
    metrics.enriched_fail++;
    return;
  }

  log.info('UPSERT', 'profile_updated', {
    ...ctx,
    fields: changedFields.join(',') || updatedFields.join(','),
  });

  // F) Write spender_event if there are actually changed fields
  if (changedFields.length > 0) {
    const idemKey = `spender:${job.tg_user_id}:profile:${profileHash(changedFields, job.last_message_id)}`;

    try {
      await writeSpenderEvent(db, {
        tgUserId: job.tg_user_id,
        eventType: 'profile_updated',
        idempotencyKey: idemKey,
        summary: `Profil enrichi: ${changedFields.join(', ')}`,
        payload: {
          fields: changedFields,
          extracted: structuredProfile,
          last_message_id: job.last_message_id,
        },
      });
      log.info('EVENT', 'profile_updated', { ...ctx, idempotency_key: idemKey });
    } catch (evErr) {
      log.warn('EVENT', 'insert_failed', { ...ctx, error: evErr instanceof Error ? evErr.message : String(evErr) });
    }
  }

  // G) Complete
  await completeJob(job.id, 'done');

  log.info('QUEUE', 'done', {
    conv_id: job.conversation_id,
    tg_user_id: job.tg_user_id,
    last_message_id: job.last_message_id ?? 0,
  });

  metrics.enriched_ok++;
}

/**
 * Main enrich loop. Runs forever, claiming and processing jobs.
 * Respects ENRICH_CONCURRENCY (sequential within loop, one at a time).
 */
export async function startEnrichWorker(): Promise<void> {
  metrics.running = true;
  log.info('ENRICH', 'worker_started', {
    worker_id: WORKER_ID,
    poll_ms: POLL_MS,
    batch_limit: BATCH_LIMIT,
  });

  while (true) {
    metrics.lastPollAt = new Date().toISOString();

    let processedInBatch = 0;

    try {
      for (let i = 0; i < BATCH_LIMIT; i++) {
        const job = await claimJob();
        if (!job) {
          if (i === 0) metrics.queue_empty++;
          break;
        }

        try {
          await processJob(job);
          processedInBatch++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log.error('ENRICH', 'process_crash', { job_id: job.id, error: errMsg });
          await completeJob(job.id, 'failed', errMsg);
          metrics.enriched_fail++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error('ENRICH', 'loop_error', { error: errMsg });
    }

    if (processedInBatch === 0) {
      await sleep(POLL_MS);
    } else {
      await sleep(100);
    }
  }
}
