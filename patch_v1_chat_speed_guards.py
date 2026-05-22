#!/usr/bin/env python3
from pathlib import Path

APP = Path("dadash-app.compiled.js")
INDEX = Path("index.html")
SW = Path("sw.js")


def replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected 1 occurrence for {old[:160]!r}, found {count}")
    return source.replace(old, new, 1)


src = APP.read_text()

src = replace_once(
    src,
    'return function _dmsgFetch(_x137){return _ref426.apply(this,arguments)}}();var _DMSG_READ_SET={};',
    'return function _dmsgFetch(_x137){return _ref426.apply(this,arguments)}}();var _dmsgFetchRaw=_dmsgFetch,_DMSG_SEND_FLIGHTS={},DMSG_SEND_FLIGHT_TTL_MS=45000;var _dmsgSendFlightKey=function _dmsgSendFlightKey(path,opts){try{if(!/^\\/send-/.test(path||""))return null;if(!opts||String(opts.method||"GET").toUpperCase()!=="POST")return null;var body=typeof opts.body==="string"?opts.body:JSON.stringify(opts.body||{});var parsed=JSON.parse(body||"{}");return[path,parsed.chat_id||"",parsed.model_id||"",parsed.text||parsed.message||parsed.caption||"",parsed.media_url||parsed.photo_url||parsed.video_url||parsed.audio_url||""].join("|")}catch(_){return null}};var _dmsgInvalidateAfterSend=function _dmsgInvalidateAfterSend(path,opts){try{if(!/^\\/send-/.test(path||""))return;var body=typeof(opts&&opts.body)==="string"?JSON.parse(opts.body||"{}"):opts&&opts.body||{};var chatId=body.chat_id;if(chatId){delete _DMSG_MSG_CACHE[String(chatId)];try{_idbSetMsgs(String(chatId),[])}catch(_){}}_DMSG_CONV_CACHE.ts=0;try{window.dispatchEvent(new CustomEvent("dadashDmsgSendSettled",{detail:{chat_id:chatId,path:path}}))}catch(_){}}catch(_){_DMSG_CONV_CACHE.ts=0}};_dmsgFetch=function(path,opts){opts=opts||{};var flightKey=_dmsgSendFlightKey(path,opts);if(flightKey&&_DMSG_SEND_FLIGHTS[flightKey]&&Date.now()-_DMSG_SEND_FLIGHTS[flightKey].ts<DMSG_SEND_FLIGHT_TTL_MS)return _DMSG_SEND_FLIGHTS[flightKey].promise;var promise=_dmsgFetchRaw(path,opts).then(function(data){_dmsgInvalidateAfterSend(path,opts);return data})["finally"](function(){if(flightKey)delete _DMSG_SEND_FLIGHTS[flightKey]});if(flightKey)_DMSG_SEND_FLIGHTS[flightKey]={ts:Date.now(),promise:promise};return promise};var _DMSG_READ_SET={};',
)

src = replace_once(
    src,
    'document.addEventListener("visibilitychange",onVisible);return function(){return document.removeEventListener("visibilitychange",onVisible)}},[]);',
    'document.addEventListener("visibilitychange",onVisible);window.addEventListener("focus",onVisible);return function(){document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onVisible)}},[]);',
)

APP.write_text(src)

for path in (INDEX, SW):
    text = path.read_text()
    text = text.replace("dadash-app.compiled.js?v=lea-live1", "dadash-app.compiled.js?v=lea-fast1")
    path.write_text(text)

print("V1 chat speed guards patched")
