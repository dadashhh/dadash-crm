#!/usr/bin/env node
const fs = require('fs');

const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'window.__DMSG_IDENTITY_GUARD_MARKER="chat_id_model_id_cache_tabs"',
  'var _dmsgCacheKeyFromParts=function _dmsgCacheKeyFromParts(chatId,modelId)',
  'var _dmsgCacheKeyForConv=function _dmsgCacheKeyForConv(conv)',
  'var cid=_dmsgConvKey(conv)||String(_dmsgChatId(conv)||"")',
  'prev.find(function(t){return _dmsgConvKey(t)===cid})',
  'prev.filter(function(t){return _dmsgConvKey(t)!==activeTabId})',
  'var nextKey=next.length>0?_dmsgConvKey(next[next.length-1]):null',
  'activeTabId!==String(_dmsgConvKey(selectedConv)||"")',
  'var tabCid=_dmsgConvKey(tab)||String(_dmsgChatId(tab)||"")',
  'var cacheKey=_dmsgCacheKeyForConv(conv)',
  '_DMSG_MSG_CACHE[cacheKey]',
  '_idbGetMsgs(cacheKey)',
  '_dmsgMsgCacheSet(cacheKey,msgs)',
  '_idbSetMsgs(cacheKey,msgs)',
  'delete _DMSG_MSG_CACHE[_dmsgCacheKeyFromParts(chatId,body.model_id)]',
];

const mustNotContain = [
  'if(prev.find(function(t){return _dmsgChatId(t)===cid}))',
  'var filtered=prev.filter(function(t){return _dmsgChatId(t)!==activeTabId})',
  'var lastCid=next.length>0?_dmsgChatId(next[next.length-1]):null',
  'activeTabId!==String(_dmsgChatId(selectedConv)||"")',
  'var tabCid=_dmsgChatId(tab)',
  '_DMSG_MSG_CACHE[String(cid)]',
  'return _idbGetMsgs(cid)',
  '_dmsgMsgCacheSet(String(cid),_gpIdb.data,_gpIdb.ts)',
  '_dmsgMsgCacheSet(String(cid),_tIdb.data,_tIdb.ts)',
  '_idbSetMsgs(cid,msgs)',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing V1 chat identity guard: ${needle}`);
  }
}

for (const needle of mustNotContain) {
  if (source.includes(needle)) {
    throw new Error(`Stale chat-id-only identity pattern remains: ${needle}`);
  }
}

console.log('V1 chat identity guards OK');
