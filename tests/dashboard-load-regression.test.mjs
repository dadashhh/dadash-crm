import assert from "node:assert/strict";
import fs from "node:fs";

const bundle = fs.readFileSync(new URL("../dadash-app.compiled.js", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.equal(
  bundle.includes("return Promise.race([Promise.all([txPromise,spPromise]),_w1Timeout]);"),
  false,
  "Dashboard loadData must not wait for spenders before setting transaction KPIs."
);

assert.match(
  bundle,
  /setTxs\(txData\);setTxSummary\(txSumData\);setTxTotal\(txR\.count\|\|txData\.length\|\|0\);setDataLoading\(false\);/,
  "Dashboard loadData must clear the loader as soon as critical transaction state is set."
);

assert.match(
  bundle,
  /select\("id,date,chatter_id,model_id,provider_id,spender_id,spender_handle,amount,currency,status,net_amount,chatter_commission,created_at,updated_at",\{count:"exact"\}\)\.gte\("created_at",new Date\(Date\.now\(\)-30\*24\*60\*60\*1000\)\.toISOString\(\)\)\.order\("date",\{ascending:false\}\)\.limit\(500\)/,
  "The critical gerant transaction query must use a small recent-window projection for KPIs."
);

assert.match(
  bundle,
  /Transactions backfilled in background n=/,
  "The slower all-time transaction fetch must run in the background after KPIs render."
);

assert.equal(
  bundle.includes('event==="SIGNED_IN"||event==="TOKEN_REFRESHED"'),
  false,
  "Auth initialization must not run loadData twice from global SIGNED_IN/INITIAL_SESSION events."
);

assert.match(
  bundle,
  /event==="TOKEN_REFRESHED"/,
  "Auth refresh recovery should still be handled."
);

assert.equal(
  indexHtml.includes('window.__buildDate = "2026-02-27";'),
  false,
  "The CRM header/build date must not be pinned to the Supabase project creation date."
);

assert.match(
  indexHtml,
  /dadash-app\.compiled\.js\?v=fix-kpi-lea-big-video1/,
  "The app bundle URL must be bumped so existing service workers fetch the fixed bundle."
);

assert.match(
  serviceWorker,
  /CACHE_NAME = 'dadash-fix-kpi-lea-big-video1'/,
  "The service worker cache name must be bumped to evict cached fast6 app shells."
);
