#!/usr/bin/env node
const fs = require("fs");

const bundlePath = "dadash-app.compiled.js";
const indexPath = "index.html";
const swPath = "sw.js";

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

let bundle = fs.readFileSync(bundlePath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");
let sw = fs.readFileSync(swPath, "utf8");

bundle = replaceOnce(
  bundle,
  'q=sb.from("v_tg_conversations").select("*");if(_roleIs(u,"chatter")){myModelIds=getChatterContext(u,models).assignedModelIds;',
  'q=sb.from("v_tg_conversations").select("*");if(_roleIs(u,"chatter")||_roleIs(u,"manager_chatter")){myModelIds=getChatterContext(u,models).assignedModelIds;',
  "TLG manager_chatter assigned_models scope",
);

bundle = replaceOnce(
  bundle,
  '{id:"messagerie",icon:"\\uD83D\\uDCAC",label:t(lang,"messaging"),show:role==="chatter"}',
  '{id:"messagerie",icon:"\\uD83D\\uDCAC",label:t(lang,"messaging"),show:role==="chatter"||role==="manager_chatter"}',
  "manager_chatter messaging nav entrypoint",
);

index = replaceOnce(
  index,
  'window.__buildId = "fix-kpi-lea-big-video1";',
  'window.__buildId = "alice-lea-access-kpi1";',
  "index build id",
);
index = replaceAll(
  index,
  "dadash-app.compiled.js?v=fix-kpi-lea-big-video1",
  "dadash-app.compiled.js?v=alice-lea-access-kpi1",
  "index compiled bundle cache key",
);

sw = replaceOnce(
  sw,
  "const CACHE_NAME = 'dadash-fix-kpi-lea-big-video1';",
  "const CACHE_NAME = 'dadash-alice-lea-access-kpi1';",
  "service worker cache name",
);
sw = replaceAll(
  sw,
  "/dadash-app.compiled.js?v=fix-kpi-lea-big-video1",
  "/dadash-app.compiled.js?v=alice-lea-access-kpi1",
  "service worker compiled bundle cache key",
);

fs.writeFileSync(bundlePath, bundle);
fs.writeFileSync(indexPath, index);
fs.writeFileSync(swPath, sw);

console.log("patched V1 manager_chatter messaging scope");
