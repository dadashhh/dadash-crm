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
  bundle.includes('window.__DADASH_TUS_MEDIA_UPLOAD_MARKER="lea_big_video_tus_no_send"'),
  "V1 media library must expose the Lea big-video TUS no-send marker",
);

assert(
  bundle.includes("/storage/v1/upload/resumable") &&
    bundle.includes('"Tus-Resumable":"1.0.0"') &&
    bundle.includes("Upload-Offset") &&
    bundle.includes("application/offset+octet-stream"),
  "V1 media library uploads must use browser-side Supabase TUS resumable chunks",
);

assert(
  bundle.includes("window.__dadashStableMediaFilename=function(file)") &&
    bundle.includes('filename=window.__dadashStableMediaFilename(file);path="".concat(mediaModel,"/").concat(filename);'),
  "V1 media library uploads must use a stable media-library/<model>/<filename> object path",
);

assert(
  bundle.includes("window.__dadashValidateMediaAlbumModel=async function(sb,albumId,modelName)") &&
    bundle.includes("sb.from(\"media_albums\").select(\"id,model\").eq(\"id\",albumId).limit(1)") &&
    bundle.includes('throw new Error("media_album_scope_mismatch")'),
  "V1 media library upload must fail closed when active album model mismatches the selected model",
);

assert(
  bundle.includes("window.__dadashUploadMediaLibraryFile(sb,{bucket:\"media-library\",path:path,file:file,cacheControl:\"3600\"})"),
  "V1 library upload path must call the TUS helper before creating media_library rows",
);

assert(
  bundle.includes("urlData=uploadResult.urlData;_context270.n=8;return sb.from(\"media_library\").insert") ||
    bundle.includes("urlData=uploadResult.urlData;_context280.n=7;return sb.from(\"media_library\").insert"),
  "V1 media_library rows must be inserted only after the TUS upload completes",
);

assert(index.includes('window.__buildId = "lea-big-video1";'), "index build id must invalidate stale V1 cache");
assert(sw.includes("dadash-lea-big-video1"), "service worker cache name must be bumped");
assert(sw.includes("/dadash-app.compiled.js?v=lea-big-video1"), "service worker must precache the patched bundle");

console.log("OK v1 Lea big video resumable no-send guard present");
