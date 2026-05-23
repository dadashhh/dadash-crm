const fs = require("fs");

const BUNDLE = "dadash-app.compiled.js";
const INDEX = "index.html";
const SW = "sw.js";

let bundle = fs.readFileSync(BUNDLE, "utf8");
let index = fs.readFileSync(INDEX, "utf8");
let sw = fs.readFileSync(SW, "utf8");

function replaceOnce(haystack, needle, replacement, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`missing anchor: ${label}`);
  }
  return haystack.replace(needle, replacement);
}

const helperAnchor =
  'console.log("[APP_DIAG] views_kpi=apiFetchKpis(from txs) views_spenders=v_spenders_ui/v_spenders_canon/v_spenders views_activity=v_activity_feed/v_activity_feed_unified/v_spender_events");var UI=';

const helper =
  'console.log("[APP_DIAG] views_kpi=apiFetchKpis(from txs) views_spenders=v_spenders_ui/v_spenders_canon/v_spenders views_activity=v_activity_feed/v_activity_feed_unified/v_spender_events");' +
  'window.__DADASH_TUS_MEDIA_UPLOAD_MARKER="lea_big_video_tus_no_send";' +
  'function __dadashTusB64(v){return btoa(unescape(encodeURIComponent(String(v||""))))}' +
  'window.__dadashStableMediaFilename=function(file){var raw=String(file&&file.name||"media").toLowerCase();var ext=(raw.split(".").pop()||"bin").replace(/[^a-z0-9]/g,"")||"bin";var stem=raw.replace(/\\.[^.]+$/,"").replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)||"media";return stem+"-"+String(file&&file.size||0)+"."+ext};' +
  'window.__dadashValidateMediaAlbumModel=async function(sb,albumId,modelName){if(!albumId)return null;var resp=await sb.from("media_albums").select("id,model").eq("id",albumId).limit(1);if(resp.error)throw resp.error;var album=(resp.data||[])[0];if(!album)throw new Error("media_album_missing");if(String(album.model||"").toLowerCase()!==String(modelName||"").toLowerCase())throw new Error("media_album_scope_mismatch");return album};' +
  'window.__dadashUploadMediaLibraryFile=async function(sb,opts){var bucket=opts.bucket,path=opts.path,file=opts.file,cacheControl=opts.cacheControl||"3600",onProgress=opts.onProgress;var supabaseUrl=(window.SUPABASE_URL||SUPABASE_URL||"").replace(/\\/$/,"");var apiKey=window.SUPABASE_ANON_KEY||SUPABASE_ANON_KEY||"";var sessionResp=sb.auth&&sb.auth.getSession?await sb.auth.getSession().catch(function(){return null}):null;var token=sessionResp&&sessionResp.data&&sessionResp.data.session&&sessionResp.data.session.access_token||apiKey;if(!supabaseUrl||!apiKey)throw new Error("supabase_upload_config_missing");var meta=["bucketName "+__dadashTusB64(bucket),"objectName "+__dadashTusB64(path),"contentType "+__dadashTusB64(file.type||"application/octet-stream"),"cacheControl "+__dadashTusB64(cacheControl)].join(",");var baseHeaders={"apikey":apiKey,"authorization":"Bearer "+token,"Tus-Resumable":"1.0.0"};var createResp=await fetch(supabaseUrl+"/storage/v1/upload/resumable",{method:"POST",headers:Object.assign({},baseHeaders,{"Upload-Length":String(file.size),"Upload-Metadata":meta,"x-upsert":"false"})});if(!createResp.ok)throw new Error("tus_create_failed_"+createResp.status);var location=createResp.headers.get("Location");if(!location)throw new Error("tus_missing_location");var uploadUrl=location.indexOf("http")===0?location:supabaseUrl+location;var offset=0;var chunkSize=6*1024*1024;while(offset<file.size){var next=Math.min(offset+chunkSize,file.size);var patchResp=await fetch(uploadUrl,{method:"PATCH",headers:Object.assign({},baseHeaders,{"Content-Type":"application/offset+octet-stream","Upload-Offset":String(offset)}),body:file.slice(offset,next)});if(!patchResp.ok)throw new Error("tus_patch_failed_"+patchResp.status);offset=Number(patchResp.headers.get("Upload-Offset")||next);if(onProgress)onProgress(offset,file.size)}return{path:path,urlData:sb.storage.from(bucket).getPublicUrl(path).data}};' +
  "var UI=";

bundle = replaceOnce(bundle, helperAnchor, helper, "TUS helper");

bundle = replaceOnce(
  bundle,
  'var results,i,file,confirmUpload,ext,filename,path,_yield$sb$storage$fro1,storageError,_sb$storage$from$getP1,urlData,_yield$sb$from$insert31,dbError,_t274;',
  'var results,i,file,confirmUpload,ext,filename,path,albumIdForUpload,uploadResult,urlData,_yield$sb$from$insert31,dbError,_t274;',
  "ressources upload vars",
);

bundle = replaceOnce(
  bundle,
  'path="".concat(mediaModel,"/").concat(filename);_context270.n=6;return sb.storage.from("media-library").upload(path,file,{cacheControl:"3600",upsert:false});case 6:_yield$sb$storage$fro1=_context270.v;storageError=_yield$sb$storage$fro1.error;if(!storageError){_context270.n=7;break}throw storageError;case 7:_sb$storage$from$getP1=sb.storage.from("media-library").getPublicUrl(path),urlData=_sb$storage$from$getP1.data;_context270.n=8;return sb.from("media_library").insert({url:urlData.publicUrl,name:file.name,filename:file.name,type:file.type.startsWith("video")?"video":"photo",model:mediaModel,category:mediaCategory||"Autres",album_id:IS_UUID.test(activeAlbum)?activeAlbum:null,size:file.size,created_at:new Date().toISOString()});',
  'filename=window.__dadashStableMediaFilename(file);path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=IS_UUID.test(activeAlbum)?activeAlbum:null;_context270.n=6;return window.__dadashValidateMediaAlbumModel(sb,albumIdForUpload,mediaModel);case 6:_context270.n=7;return window.__dadashUploadMediaLibraryFile(sb,{bucket:"media-library",path:path,file:file,cacheControl:"3600"});case 7:uploadResult=_context270.v;urlData=uploadResult.urlData;_context270.n=8;return sb.from("media_library").insert({url:urlData.publicUrl,name:file.name,filename:file.name,type:file.type.startsWith("video")?"video":"photo",model:mediaModel,category:mediaCategory||"Autres",album_id:albumIdForUpload,size:file.size,created_at:new Date().toISOString()});',
  "ressources upload TUS",
);

bundle = replaceOnce(
  bundle,
  'var results,i,file,confirmUpload,ext,filename,path,_yield$sb$storage$fro10,storageError,_sb$storage$from$getP10,urlData,_yield$sb$from$insert34,dbError,_t276;',
  'var results,i,file,confirmUpload,ext,filename,path,albumIdForUpload,uploadResult,urlData,_yield$sb$from$insert34,dbError,_t276;',
  "media manager upload vars",
);

bundle = replaceOnce(
  bundle,
  'path="".concat(mediaModel,"/").concat(filename);_context280.n=5;return sb.storage.from("media-library").upload(path,file,{cacheControl:"3600",upsert:false});case 5:_yield$sb$storage$fro10=_context280.v;storageError=_yield$sb$storage$fro10.error;if(!storageError){_context280.n=6;break}throw storageError;case 6:_sb$storage$from$getP10=sb.storage.from("media-library").getPublicUrl(path),urlData=_sb$storage$from$getP10.data;_context280.n=7;return sb.from("media_library").insert({url:urlData.publicUrl,name:file.name,filename:file.name,type:file.type.startsWith("video")?"video":"photo",model:mediaModel,category:mediaCategory||"Autres",album_id:(activeAlbum===null||activeAlbum===void 0?void 0:activeAlbum.id)||null,size:file.size,created_at:new Date().toISOString()});',
  'filename=window.__dadashStableMediaFilename(file);path="".concat(mediaModel,"/").concat(filename);albumIdForUpload=(activeAlbum===null||activeAlbum===void 0?void 0:activeAlbum.id)||null;_context280.n=5;return window.__dadashValidateMediaAlbumModel(sb,albumIdForUpload,mediaModel);case 5:_context280.n=6;return window.__dadashUploadMediaLibraryFile(sb,{bucket:"media-library",path:path,file:file,cacheControl:"3600"});case 6:uploadResult=_context280.v;urlData=uploadResult.urlData;_context280.n=7;return sb.from("media_library").insert({url:urlData.publicUrl,name:file.name,filename:file.name,type:file.type.startsWith("video")?"video":"photo",model:mediaModel,category:mediaCategory||"Autres",album_id:albumIdForUpload,size:file.size,created_at:new Date().toISOString()});',
  "media manager upload TUS",
);

index = replaceOnce(index, 'window.__buildId = "lea-scope1";', 'window.__buildId = "lea-big-video1";', "index build id");
index = index.replaceAll("dadash-app.compiled.js?v=lea-scope1", "dadash-app.compiled.js?v=lea-big-video1");
sw = replaceOnce(sw, "const CACHE_NAME = 'dadash-lea-scope1';", "const CACHE_NAME = 'dadash-lea-big-video1';", "sw cache name");
sw = sw.replaceAll("/dadash-app.compiled.js?v=lea-scope1", "/dadash-app.compiled.js?v=lea-big-video1");

fs.writeFileSync(BUNDLE, bundle);
fs.writeFileSync(INDEX, index);
fs.writeFileSync(SW, sw);

console.log("patched V1 Lea big video upload guard");
