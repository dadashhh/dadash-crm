#!/usr/bin/env node
const fs = require("fs");

const bundle = fs.readFileSync("dadash-app.compiled.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const scopedTlgQuery =
  'q=sb.from("v_tg_conversations").select("*");if(_roleIs(u,"chatter")||_roleIs(u,"manager_chatter")){myModelIds=getChatterContext(u,models).assignedModelIds;';
const staleTlgQuery =
  'q=sb.from("v_tg_conversations").select("*");if(_roleIs(u,"chatter")){myModelIds=getChatterContext(u,models).assignedModelIds;';
const managerMessagingNav =
  '{id:"messagerie",icon:"\\uD83D\\uDCAC",label:t(lang,"messaging"),show:role==="chatter"||role==="manager_chatter"}';

assert(
  bundle.includes(scopedTlgQuery),
  "TLG conversations must scope manager_chatter with assigned_models like chatter",
);
assert(
  !bundle.includes(staleTlgQuery),
  "stale chatter-only TLG scope remains",
);
assert(
  bundle.includes(managerMessagingNav),
  "manager_chatter must see the V1 messaging entrypoint",
);
assert(
  index.includes('window.__buildId = "alice-lea-access-kpi1";') ||
    index.includes('window.__buildId = "conv-bottom1";'),
  "index build id must be bumped for Alice/Lea access patch",
);
assert(
  index.includes("dadash-app.compiled.js?v=alice-lea-access-kpi1") ||
    index.includes("dadash-app.compiled.js?v=conv-bottom1"),
  "index bundle query must invalidate stale compiled app",
);
assert(
  sw.includes("dadash-alice-lea-access-kpi1") ||
    sw.includes("dadash-conv-bottom1"),
  "service worker cache name must be bumped for Alice/Lea access patch",
);
assert(
  sw.includes("/dadash-app.compiled.js?v=alice-lea-access-kpi1") ||
    sw.includes("/dadash-app.compiled.js?v=conv-bottom1"),
  "service worker must precache the patched compiled app",
);

console.log("OK V1 manager_chatter messaging scope");
