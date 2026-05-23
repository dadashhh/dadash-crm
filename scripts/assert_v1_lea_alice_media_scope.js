const fs = require("fs");

const bundle = fs.readFileSync("dadash-app.compiled.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL", message);
    process.exit(1);
  }
}

assert(
  !bundle.includes('select("id,type,url,filename,model_id,product_id,album_id,created_at,metadata")'),
  "media_library queries must not request missing model_id/metadata columns",
);

assert(
  bundle.includes('media_library fetch blocked: modele manquant') ||
    bundle.includes('media_library fetch blocked: modèle manquant'),
  "conversation media library must fail closed when current model is missing",
);

assert(
  bundle.includes('if(!mName){console.warn("[DadashMessagerieTab] media_library fetch blocked: modèle manquant");setMediaItems([]);setMediaLoading(false);return function(){cancelled=true}}var q=sb.from("media_library")'),
  "conversation media library must not run an unfiltered media_library query",
);

assert(
  bundle.includes('var pickerModelName=((MODEL_ID_TO_NAME[modelName]||modelName||"")+"").toLowerCase();'),
  "script media picker must normalize model id/name before filtering",
);

assert(
  bundle.includes('sb.from("media_albums").select("id, name, model, cover_url, created_at, emoji, is_default").eq("model",pickerModelName)'),
  "script media picker albums must be filtered by model",
);

assert(
  bundle.includes('sb.from("media_library").select("id, url, name, type, filename, model, created_at, size, category, tags, album_id").eq("model",pickerModelName)'),
  "script media picker library must be filtered by model",
);

assert(
  index.includes('window.__buildId = "lea-scope1";') ||
    index.includes('window.__buildId = "lea-big-video1";'),
  "index build id must invalidate stale V1 cache",
);
assert(
  sw.includes("dadash-lea-scope1") || sw.includes("dadash-lea-big-video1"),
  "service worker cache name must be bumped",
);
assert(
  sw.includes("/dadash-app.compiled.js?v=lea-scope1") ||
    sw.includes("/dadash-app.compiled.js?v=lea-big-video1"),
  "service worker must precache the patched bundle",
);

console.log("OK v1 lea/alice media scope guard present");
