#!/usr/bin/env node
const fs = require('fs');

const APP = 'dadash-app.compiled.js';
const INDEX = 'index.html';
const SW = 'sw.js';

let app = fs.readFileSync(APP, 'utf8');

function replaceOnce(source, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Expected 1 occurrence, found ${count}: ${before.slice(0, 160)}`);
  }
  return source.replace(before, after);
}

app = replaceOnce(
  app,
  'var isInitialLoadingRef=React.useRef(false);React.useEffect(function(){var resetActivity=',
  'var isInitialLoadingRef=React.useRef(false);var openBottomScrollGuardUntilRef=React.useRef(0);window.__DMSG_OPEN_BOTTOM_SCROLL_GUARD="selected_conversation_bottom_first";React.useEffect(function(){var resetActivity='
);

app = replaceOnce(
  app,
  '}},[]);var handleMsgScroll=useCallback(function(e){var el=e.currentTarget;',
  '}},[]);var forceOpenBottomScroll=useCallback(function forceOpenBottomScroll(){openBottomScrollGuardUntilRef.current=Date.now()+900;isUserScrollRef.current=false;setHasNewMessages(false);setShowScrollBtn(false);setTimeout(function(){return scrollToBottom("instant")},0);setTimeout(function(){return scrollToBottom("instant")},80);setTimeout(function(){return scrollToBottom("instant")},240);setTimeout(function(){return scrollToBottom("instant")},600)},[scrollToBottom]);var handleMsgScroll=useCallback(function(e){var el=e.currentTarget;'
);

app = replaceOnce(
  app,
  'if(scrollTop<50&&hasMoreMsgs&&!loadingMore){setLoadingMore(true);var prevHeight=el.scrollHeight;',
  'if(scrollTop<50&&hasMoreMsgs&&!loadingMore){if(Date.now()<openBottomScrollGuardUntilRef.current){scrollToBottom("auto");return}setLoadingMore(true);var prevHeight=el.scrollHeight;'
);

app = replaceOnce(
  app,
  'setLoadingMore(false);var t=setTimeout(function(){scrollToBottom("instant")},300);',
  'setLoadingMore(false);forceOpenBottomScroll();var t=setTimeout(function(){forceOpenBottomScroll()},300);'
);

fs.writeFileSync(APP, app);

let index = fs.readFileSync(INDEX, 'utf8');
index = index.replace(/window\.__buildId = "[^"]+";/, 'window.__buildId = "conv-bottom1";');
index = index.replace(/dadash-app\.compiled\.js\?v=[^"']+/g, 'dadash-app.compiled.js?v=conv-bottom1');
fs.writeFileSync(INDEX, index);

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'dadash-conv-bottom1';");
sw = sw.replace(/dadash-app\.compiled\.js\?v=[^"']+/g, 'dadash-app.compiled.js?v=conv-bottom1');
fs.writeFileSync(SW, sw);

console.log('Patched V1 conversation open bottom scroll guard');
