/**
 * dadash-telegram-autofill — Worker entry point
 *
 * Enrich loop: claims queued jobs, extracts profiles, updates spenders.
 */
import http from 'node:http';
import { startEnrichWorker, metrics } from './worker/enrichWorker.js';
import { log } from './logger.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const START_TIME = Date.now();

// ── HTTP health endpoint ──
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        role: 'enrich_worker',
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        ...metrics,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  log.info('WORKER', 'health_server_started', { port: PORT });
});

startEnrichWorker().catch((err) => {
  log.error('WORKER', 'fatal', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
