#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / "dadash-app.compiled.js"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"
VERCEL = ROOT / "vercel.json"


def replace_all(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text()
    original = text
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new)
    if text != original:
        path.write_text(text)


replace_all(APP, [
    (
        'select("id,conversation_id,sender_type,text,media_url,media_type,created_at,tg_message_id,metadata")',
        'select("id,conversation_id,direction,text,media_url,created_at,tg_message_id,meta,model_id,sent_at")',
    ),
    (
        'select("id,conversation_id,sender_type,text,media_url,media_type,created_at,tg_message_id,metadata,model_id")',
        'select("id,conversation_id,direction,text,media_url,created_at,tg_message_id,meta,model_id,sent_at")',
    ),
    (
        'select("id, conversation_id, sender_id, direction, text, media_url, created_at, updated_at, status, is_outgoing, sender_type")',
        'select("id, conversation_id, direction, text, media_url, created_at, tg_message_id, meta, model_id, sent_at")',
    ),
    (
        'select("id,type,url,filename,model_id,product_id,album_id,created_at,metadata")',
        'select("id,type,url,filename,model,product_id,album_id,created_at,name,size,category,tags")',
    ),
    (
        'select("id,model,name,type,created_at")',
        'select("id,model,name,created_at,emoji,cover_url,is_default")',
    ),
    (
        'select("id,user_id,type,title,body,read,created_at,metadata")',
        'select("id,user_id,type,title,body:message,read,created_at,metadata:payload")',
    ),
    (
        'window.sb.from("sent_medias").upsert(row,{onConflict:"media_url,spender_id,model_id",ignoreDuplicates:false})',
        'window.sb.from("sent_medias").insert(row)',
    ),
    ('timeout:120000', 'timeout:600000'),
    ('?120000:30000', '?600000:30000'),
])

replace_all(INDEX, [
    ('window.__buildId = "55a58fe";', 'window.__buildId = "v1-video-schema-fix";'),
    ('<script src="./dadash-app.compiled.js?v=fast7"></script>', '<script src="./dadash-app.compiled.js?v=fast8"></script>'),
])

replace_all(SW, [
    ("const CACHE_NAME = 'dadash-fast-v7';", "const CACHE_NAME = 'dadash-fast-v8';"),
    ('"/dadash-app.compiled.js?v=fast7"', '"/dadash-app.compiled.js?v=fast8"'),
])

replace_all(VERCEL, [
    (
        "img-src 'self' data: blob: https://lkrzjwfwhiimpnsyeuxi.supabase.co; connect-src",
        "img-src 'self' data: blob: https://lkrzjwfwhiimpnsyeuxi.supabase.co; media-src 'self' blob: https://lkrzjwfwhiimpnsyeuxi.supabase.co; connect-src",
    ),
])

print("patched V1 video/schema/cache/CSP")
