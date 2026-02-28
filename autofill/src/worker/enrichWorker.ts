import { db } from '../supabaseClient.js';
import { log, type LogMeta } from '../logger.js';
import { extractProfile } from '../profile/extractProfile.js';
import { structureExtractedProfile, flattenForEnrichmentRpc } from '../utils/spenderHelpers.js';
import { upsertSpenderAndEvent } from '../spenders/upsertSpenderAndEvent.js';

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
  tg_user_id: number | string;
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

  // C) upsert_spender_and_event (unified: meta.profile + meta.enrich.last + spender_events profile_updated)
  const tgUserIdStr = String(job.tg_user_id).replace(/\D/g, '') || null;
  if (!tgUserIdStr) {
    log.warn('ENRICH', 'skip_no_tg_user_id', ctx);
    await completeJob(job.id, 'done');
    metrics.enriched_ok++;
    return;
  }

  const flatProfile = flattenForEnrichmentRpc(structuredProfile as Record<string, unknown>);
  const enrichFields = Object.keys(flatProfile);
  if (enrichFields.length === 0) {
    log.info('ENRICH', 'no_new_fields', ctx);
    await completeJob(job.id, 'done');
    metrics.enriched_ok++;
    return;
  }

  let spenderId: string | null = null;
  try {
    const result = await upsertSpenderAndEvent({
      tg_user_id: tgUserIdStr,
      extracted_fields: flatProfile,
      enrich_fields_list: enrichFields,
      enrich_patch: flatProfile,
    });
    spenderId = result.spender_id;
    log.info('EVENT', 'inserted', { type: 'profile_updated', fields: enrichFields.join(',') });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error('ENRICH', 'upsert_failed', { ...ctx, error: errMsg });
    await completeJob(job.id, 'failed', `upsert: ${errMsg}`);
    metrics.enriched_fail++;
    return;
  }

  // Apply enrichment to top-level columns via RPC (age, city, job, etc.)
  if (spenderId && enrichFields.length > 0) {
    try {
      await db.rpc('fn_apply_spender_enrichment', {
        p_spender_id: spenderId,
        p_tg_user_id: tgUserIdStr,
        p_enrichment: flatProfile,
      });
      log.info('ENRICH', 'top_level_applied', { spender_id: spenderId, fields: enrichFields.join(',') });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn('ENRICH', 'apply_enrichment_rpc_failed', { ...ctx, spender_id: spenderId, error: errMsg });
    }
  }

  // F) Complete
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
