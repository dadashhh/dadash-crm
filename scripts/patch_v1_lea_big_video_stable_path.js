const fs = require("fs");

const BUNDLE = "dadash-app.compiled.js";
let bundle = fs.readFileSync(BUNDLE, "utf8");

function replaceOnce(needle, replacement, label) {
  if (!bundle.includes(needle)) throw new Error(`missing anchor: ${label}`);
  bundle = bundle.replace(needle, replacement);
}

replaceOnce(
  'function __dadashTusB64(v){return btoa(unescape(encodeURIComponent(String(v||""))))}window.__dadashValidateMediaAlbumModel=',
  'function __dadashTusB64(v){return btoa(unescape(encodeURIComponent(String(v||""))))}window.__dadashStableMediaFilename=function(file){var raw=String(file&&file.name||"media").toLowerCase();var ext=(raw.split(".").pop()||"bin").replace(/[^a-z0-9]/g,"")||"bin";var stem=raw.replace(/\\.[^.]+$/,"").replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"media";return stem+"-"+String(file&&file.size||0)+"."+ext};window.__dadashValidateMediaAlbumModel=',
  "stable filename helper",
);

replaceOnce(
  'path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=IS_UUID.test(activeAlbum)?activeAlbum:null;_context270.n=6;return window.__dadashValidateMediaAlbumModel',
  'filename=window.__dadashStableMediaFilename(file);path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=IS_UUID.test(activeAlbum)?activeAlbum:null;_context270.n=6;return window.__dadashValidateMediaAlbumModel',
  "ressources stable path",
);

replaceOnce(
  'path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=(activeAlbum===null||activeAlbum===void 0?void 0:activeAlbum.id)||null;_context280.n=5;return window.__dadashValidateMediaAlbumModel',
  'filename=window.__dadashStableMediaFilename(file);path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=(activeAlbum===null||activeAlbum===void 0?void 0:activeAlbum.id)||null;_context280.n=5;return window.__dadashValidateMediaAlbumModel',
  "media manager stable path",
);

fs.writeFileSync(BUNDLE, bundle);
console.log("patched V1 Lea big video stable path");
