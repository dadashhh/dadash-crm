#!/usr/bin/env node
/**
 * Inject BUILD_ID, CACHE_VERSION, and Supabase credentials at deploy time.
 * Vercel provides VERCEL_GIT_COMMIT_SHA + env vars for Supabase config.
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

// 1. index.html — inject __buildId, __buildDate, and Supabase config
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

// Supabase credentials: inject from env vars at build time (required for production)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseUrl.startsWith('https://')) {
  indexHtml = indexHtml.replace(
    /window\.SUPABASE_URL\s*=\s*"[^"]*"/,
    `window.SUPABASE_URL = "${supabaseUrl}"`
  );
  console.log('[inject-build-id] SUPABASE_URL injected from env (' + supabaseUrl.substring(0, 12) + '...)');
} else {
  const current = indexHtml.match(/window\.SUPABASE_URL\s*=\s*"([^"]*)"/);
  if (!current || !current[1].startsWith('https://')) {
    console.error('[inject-build-id] FATAL: SUPABASE_URL env var is missing or invalid. Set it in Vercel dashboard.');
    process.exit(1);
  }
}

if (supabaseAnonKey && supabaseAnonKey.startsWith('eyJ')) {
  indexHtml = indexHtml.replace(
    /window\.SUPABASE_ANON_KEY\s*=\s*"[^"]*"/,
    `window.SUPABASE_ANON_KEY = "${supabaseAnonKey}"`
  );
  console.log('[inject-build-id] SUPABASE_ANON_KEY injected from env (eyJ...)');
} else {
  const current = indexHtml.match(/window\.SUPABASE_ANON_KEY\s*=\s*"([^"]*)"/);
  if (!current || !current[1].startsWith('eyJ')) {
    console.error('[inject-build-id] FATAL: SUPABASE_ANON_KEY env var is missing or invalid. Set it in Vercel dashboard.');
    process.exit(1);
  }
}

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
