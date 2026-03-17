// ─────────────────────────────────────────────
// manager-notifier — Railway entry point
// HTTP /health  +  manager_alerts → Telegram
// ─────────────────────────────────────────────
import http from 'node:http';
import { startPoller, metrics } from './poller.js';

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
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    const body = JSON.stringify({
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      sentCount: metrics.sentCount,
      errorCount: metrics.errorCount,
      lastPollAt: metrics.lastPollAt,
      pollerRunning: metrics.running,
    });
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(body);
    return;
  }
  res.writeHead(404, CORS_HEADERS);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[HEALTH] HTTP server listening on :${PORT} — GET /health`);
});

// ── Start poller ──────────────────────────────
startPoller().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[FATAL] Poller crashed:', msg);
  process.exit(1);
});
