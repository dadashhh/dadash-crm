#!/usr/bin/env node
const fs = require('fs');

const path = 'dadash-app.compiled.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after) {
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found: ${before.slice(0, 140)}`);
  }
  source = source.replace(before, after);
}

function replaceOnceRegex(pattern, after) {
  if (!pattern.test(source)) {
    throw new Error(`Patch regex not found: ${pattern}`);
  }
  source = source.replace(pattern, after);
}

replaceOnce(
  'var _dmsgConvKey=function _dmsgConvKey(conv){return conv?"".concat(_dmsgChatId(conv)||"","::").concat(conv.model_id||""):null};',
  'var _dmsgConvKey=function _dmsgConvKey(conv){return conv?"".concat(_dmsgChatId(conv)||"","::").concat(conv.model_id||""):null};var _dmsgCacheKeyFromParts=function _dmsgCacheKeyFromParts(chatId,modelId){return String(chatId||"")+(modelId?"::"+String(modelId):"")};var _dmsgCacheKeyForConv=function _dmsgCacheKeyForConv(conv){return conv?_dmsgCacheKeyFromParts(_dmsgChatId(conv),conv.model_id):""};window.__DMSG_IDENTITY_GUARD_MARKER="chat_id_model_id_cache_tabs";'
);

replaceOnce(
  'var openTab=useCallback(function(conv){var cid=_dmsgChatId(conv);',
  'var openTab=useCallback(function(conv){var cid=_dmsgConvKey(conv)||String(_dmsgChatId(conv)||"");var rawCid=_dmsgChatId(conv);'
);
replaceOnce('var tidStr=String(cid||"");', 'var tidStr=String(rawCid||"");');
replaceOnce('||cid&&all.find(function(x){return String(x.tg_user_id||x.telegram_id||"")===tidStr})||null;', '||rawCid&&all.find(function(x){return String(x.tg_user_id||x.telegram_id||"")===tidStr})||null;');
replaceOnce('if(prev.find(function(t){return _dmsgChatId(t)===cid})){setActiveTabId(cid);', 'if(prev.find(function(t){return _dmsgConvKey(t)===cid})){setActiveTabId(cid);');
replaceOnce('var filtered=prev.filter(function(t){return _dmsgChatId(t)!==activeTabId});', 'var filtered=prev.filter(function(t){return _dmsgConvKey(t)!==activeTabId});');
replaceOnce('setOpenTabs(function(prev){var next=prev.filter(function(t){return _dmsgChatId(t)!==cid});', 'setOpenTabs(function(prev){var next=prev.filter(function(t){return _dmsgConvKey(t)!==cid});');
replaceOnceRegex(/if\(activeTabId===cid\)\{var lastCid=next\.length>0\?_dmsgChatId\(next\[next\.length-1\]\):null;\s*setActiveTabId\(lastCid\)\}/, 'if(activeTabId===cid){var nextKey=next.length>0?_dmsgConvKey(next[next.length-1]):null;setActiveTabId(nextKey)}');
replaceOnce('useEffect(function(){if(activeTabId&&activeTabId!==String(_dmsgChatId(selectedConv)||"")){setPendingMedia(null)}},[activeTabId]);', 'useEffect(function(){if(activeTabId&&activeTabId!==String(_dmsgConvKey(selectedConv)||"")){setPendingMedia(null)}},[activeTabId]);');
replaceOnce('openTabs.map(function(tab){var tabCid=_dmsgChatId(tab);', 'openTabs.map(function(tab){var tabCid=_dmsgConvKey(tab)||String(_dmsgChatId(tab)||"");');

replaceOnceRegex(
  /if\(chatId\)\{delete _DMSG_MSG_CACHE\[String\(chatId\)\];\s*try\{_idbSetMsgs\(String\(chatId\),\[\]\)\}catch\(_\)\{\}\}_DMSG_CONV_CACHE\.ts=0;/,
  'if(chatId){delete _DMSG_MSG_CACHE[_dmsgCacheKeyFromParts(chatId,body.model_id)];delete _DMSG_MSG_CACHE[String(chatId)];try{_idbSetMsgs(_dmsgCacheKeyFromParts(chatId,body.model_id),[]);_idbSetMsgs(String(chatId),[])}catch(_){}}_DMSG_CONV_CACHE.ts=0;'
);

replaceOnce('case 2:if(!silent)markConversationAsRead(cid,conv.model_id);', 'case 2:var cacheKey=_dmsgCacheKeyForConv(conv);if(!silent)markConversationAsRead(cid,conv.model_id);');
replaceOnce('case 2:if(!silent)markConversationAsRead(cid,conv.model_id);', 'case 2:var cacheKey=_dmsgCacheKeyForConv(conv);if(!silent)markConversationAsRead(cid,conv.model_id);');

replaceOnce('_gpCached=_DMSG_MSG_CACHE[String(cid)];', '_gpCached=_DMSG_MSG_CACHE[cacheKey];');
replaceOnce('return _idbGetMsgs(cid);', 'return _idbGetMsgs(cacheKey);');
replaceOnce('_dmsgMsgCacheSet(String(cid),_gpIdb.data,_gpIdb.ts);', '_dmsgMsgCacheSet(cacheKey,_gpIdb.data,_gpIdb.ts);');
replaceOnceRegex(/_dmsgMsgCacheSet\(String\(cid\),msgs\);\s*_idbSetMsgs\(cid,msgs\);/, '_dmsgMsgCacheSet(cacheKey,msgs);_idbSetMsgs(cacheKey,msgs);');

replaceOnce('_tCached=_DMSG_MSG_CACHE[String(cid)];', '_tCached=_DMSG_MSG_CACHE[cacheKey];');
replaceOnce('return _idbGetMsgs(cid);', 'return _idbGetMsgs(cacheKey);');
replaceOnce('_dmsgMsgCacheSet(String(cid),_tIdb.data,_tIdb.ts);', '_dmsgMsgCacheSet(cacheKey,_tIdb.data,_tIdb.ts);');
replaceOnceRegex(/_dmsgMsgCacheSet\(String\(cid\),msgs\);\s*_idbSetMsgs\(cid,msgs\);/, '_dmsgMsgCacheSet(cacheKey,msgs);_idbSetMsgs(cacheKey,msgs);');

fs.writeFileSync(path, source);

for (const file of ['index.html', 'sw.js']) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/dadash-app\.compiled\.js\?v=lea-fast1/g, 'dadash-app.compiled.js?v=lea-id1');
  fs.writeFileSync(file, text);
}

console.log('Patched V1 chat identity guards');
