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
    'var _DMSG_API="https://dadash-autofill-v2-production.up.railway.app";var _DMSG_CONV_CACHE={list:[],ts:0};',
    'var _DMSG_API="https://dadash-autofill-v2-production.up.railway.app";var DMSG_CONV_CACHE_TTL_MS=15000,DMSG_CONV_POLL_MS=10000,DMSG_SOCKET_BIND_ATTEMPTS=40;window.__DMSG_LIVE_REFRESH_MARKERS="DMSG live refresh markers OK";var _DMSG_CONV_CACHE={list:[],ts:0};',
)

src = replace_once(
    src,
    'var onConnect=function onConnect(){var _socket$io;var socket=window.__dadashSocket;if(socket)console.log("[SOCKET] Connected successfully via",(_socket$io=socket.io)===null||_socket$io===void 0||(_socket$io=_socket$io.engine)===null||_socket$io===void 0||(_socket$io=_socket$io.transport)===null||_socket$io===void 0?void 0:_socket$io.name)};',
    'var onConnect=function onConnect(){var _socket$io;var socket=window.__dadashSocket;if(socket){console.log("[SOCKET] Connected successfully via",(_socket$io=socket.io)===null||_socket$io===void 0||(_socket$io=_socket$io.engine)===null||_socket$io===void 0||(_socket$io=_socket$io.transport)===null||_socket$io===void 0?void 0:_socket$io.name);try{window.dispatchEvent(new CustomEvent("dadashSocketReady"))}catch(_){}}};',
)

src = replace_once(
    src,
    'useEffect(function(){var socket=window.__dadashSocket;if(!socket)return;var onMessageRead=function onMessageRead(data){',
    'useEffect(function(){var cleanup=null,bindTimer=null,attempts=0;var bindSocket=function bindSocket(){if(cleanup)return;var socket=window.__dadashSocket;if(!socket){attempts++;if(attempts<DMSG_SOCKET_BIND_ATTEMPTS){bindTimer=setTimeout(bindSocket,250)}return}var onMessageRead=function onMessageRead(data){',
)

src = replace_once(
    src,
    'socket.on("message_read",onMessageRead);socket.on("user_typing",onUserTyping);socket.on("new_message",onNewMessage);socket.on("conv_updated",onConvUpdated);return function(){socket.off("message_read",onMessageRead);socket.off("user_typing",onUserTyping);socket.off("new_message",onNewMessage);socket.off("conv_updated",onConvUpdated)}},[]);useEffect(function(){var interval=',
    'socket.on("message_read",onMessageRead);socket.on("user_typing",onUserTyping);socket.on("new_message",onNewMessage);socket.on("conv_updated",onConvUpdated);cleanup=function(){socket.off("message_read",onMessageRead);socket.off("user_typing",onUserTyping);socket.off("new_message",onNewMessage);socket.off("conv_updated",onConvUpdated)};return cleanup};bindSocket();window.addEventListener("dadashSocketReady",bindSocket);return function(){window.removeEventListener("dadashSocketReady",bindSocket);if(bindTimer)clearTimeout(bindTimer);if(cleanup)cleanup()}},[]);useEffect(function(){var interval=',
)

src = replace_once(src, 'var CACHE_TTL=120000;', 'var CACHE_TTL=DMSG_CONV_CACHE_TTL_MS;')
src = replace_once(src, 'var delay=idleMs>30000?10000:3000;', 'var delay=idleMs>30000?5000:1500;')
src = replace_once(
    src,
    'return loadConversationsRef.current();case 4:_context234.p=4;',
    'return loadConversationsRef.current(true);case 4:_context234.p=4;',
)
src = replace_once(
    src,
    ')),60000);return function(){return clearInterval(convPollRef.current)}},[]);',
    ')),DMSG_CONV_POLL_MS);return function(){return clearInterval(convPollRef.current)}},[]);',
)

APP.write_text(src)

for path in (INDEX, SW):
    text = path.read_text()
    text = text.replace("dadash-app.compiled.js?v=lea-touch2", "dadash-app.compiled.js?v=lea-live1")
    path.write_text(text)

print("V1 messaging realtime refresh patched")
