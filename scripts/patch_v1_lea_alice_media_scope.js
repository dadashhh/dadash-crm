const fs = require("fs");

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Missing patch anchor: ${label}`);
  }
  return source.replace(from, to);
}

function replaceAll(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count === 0) {
    throw new Error(`Missing patch anchor: ${label}`);
  }
  return source.split(from).join(to);
}

let bundle = fs.readFileSync("dadash-app.compiled.js", "utf8");
let index = fs.readFileSync("index.html", "utf8");
let sw = fs.readFileSync("sw.js", "utf8");

bundle = replaceAll(
  bundle,
  'select("id,type,url,filename,model_id,product_id,album_id,created_at,metadata")',
  'select("id,type,url,filename,model,product_id,album_id,created_at,name,size,category,tags")',
  "valid media_library columns",
);

bundle = replaceOnce(
  bundle,
  'var q=sb.from("media_library").select("id,type,url,filename,model,product_id,album_id,created_at,name,size,category,tags");if(mName)q=q.eq("model",mName);else console.warn("[DadashMessagerieTab] media_library fetch SANS filtre modèle (mName vide)");q.order("created_at",{ascending:false}).limit(5000)',
  'if(!mName){console.warn("[DadashMessagerieTab] media_library fetch blocked: modèle manquant");setMediaItems([]);setMediaLoading(false);return function(){cancelled=true}}var q=sb.from("media_library").select("id,type,url,filename,model,product_id,album_id,created_at,name,size,category,tags").eq("model",mName).order("created_at",{ascending:false}).limit(5000)',
  "conversation media fail closed",
);

bundle = replaceOnce(
  bundle,
  'case 0:_context264.n=1;return Promise.all([sb.from("media_albums").select("id, name, model, cover_url, created_at, emoji, is_default").order("created_at").limit(1000),sb.from("media_library").select("id, url, name, type, filename, model, created_at, size, category, tags, album_id").order("created_at").limit(5000)])',
  'case 0:var pickerModelName=((MODEL_ID_TO_NAME[modelName]||modelName||"")+"").toLowerCase();_context264.n=1;return Promise.all([sb.from("media_albums").select("id, name, model, cover_url, created_at, emoji, is_default").eq("model",pickerModelName).order("created_at").limit(1000),sb.from("media_library").select("id, url, name, type, filename, model, created_at, size, category, tags, album_id").eq("model",pickerModelName).order("created_at").limit(5000)])',
  "script picker model filters",
);

index = replaceOnce(index, 'window.__buildId = "mc-tx1";', 'window.__buildId = "lea-scope1";', "index build id");
index = replaceAll(index, "dadash-app.compiled.js?v=mc-tx1", "dadash-app.compiled.js?v=lea-scope1", "index bundle cache key");

sw = replaceOnce(sw, "const CACHE_NAME = 'dadash-fast-v7';", "const CACHE_NAME = 'dadash-lea-scope1';", "sw cache name");
sw = replaceAll(sw, "/dadash-app.compiled.js?v=lea-id1", "/dadash-app.compiled.js?v=lea-scope1", "sw bundle cache key");

fs.writeFileSync("dadash-app.compiled.js", bundle);
fs.writeFileSync("index.html", index);
fs.writeFileSync("sw.js", sw);

console.log("patched V1 Lea/Alice media scope guard");
