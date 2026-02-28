#!/usr/bin/env node
/**
 * Inject BUILD_ID and CACHE_VERSION at deploy time.
 * Vercel provides VERCEL_GIT_COMMIT_SHA. Ensures same build everywhere + SW cache versioned.
 */
const fs = require('fs');
const path = require('path');

let commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!commitSha) {
  try { commitSha = require('child_process').execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch (e) { commitSha = 'dev'; }
}
const shortSha = commitSha.slice(0, 7);
const buildDate = new Date().toISOString().slice(0, 10);

const root = path.join(__dirname, '..');

// 1. index.html — inject __buildId and __buildDate
const indexPath = path.join(root, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml.replace(
  /window\.__buildId\s*=\s*"[^"]*"/,
  `window.__buildId = "${shortSha}"`
);
indexHtml = indexHtml.replace(
  /window\.__buildDate\s*=\s*"[^"]*"/,
  `window.__buildDate = "${buildDate}"`
);
fs.writeFileSync(indexPath, indexHtml);
console.log('[inject-build-id] index.html: __buildId=' + shortSha + ' __buildDate=' + buildDate);

// 2. sw.js — inject CACHE_VERSION (commit hash) so each deploy invalidates cache
const swPath = path.join(root, 'sw.js');
let swJs = fs.readFileSync(swPath, 'utf8');
const cacheName = 'dadash-' + shortSha;
swJs = swJs.replace(
  /const CACHE_NAME\s*=\s*'[^']*'/,
  `const CACHE_NAME = '${cacheName}'`
);
fs.writeFileSync(swPath, swJs);
console.log('[inject-build-id] sw.js: CACHE_NAME=' + cacheName);
