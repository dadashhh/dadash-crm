// ─────────────────────────────────────────────
// manager-notifier — Railway entry point
// HTTP /health  +  manager_alerts → Telegram  +  enrich poller
// ─────────────────────────────────────────────
import http from 'node:http';
import { startPoller, metrics } from './poller.js';
import { startEnrichPoller, enrichMetrics } from './enrich.js';

// ── Env validation ───────────────────────────
const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN'] as const;
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const START_TIME = Date.now();

// ── HTTP health server ────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const body = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      alerts: {
        sentCount: metrics.sentCount,
        errorCount: metrics.errorCount,
        lastPollAt: metrics.lastPollAt,
        running: metrics.running,
      },
      enrich: {
        processed: enrichMetrics.processed,
        errors: enrichMetrics.errors,
        lastPollAt: enrichMetrics.lastPollAt,
        running: enrichMetrics.running,
      },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[HEALTH] HTTP server listening on :${PORT} — GET /health`);
});

// ── Start pollers ──────────────────────────────
startPoller().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[FATAL] Alert poller crashed:', msg);
  process.exit(1);
});

startEnrichPoller().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[WARN] Enrich poller failed to start:', msg);
});
