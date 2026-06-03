#!/usr/bin/env node
const fs = require('fs');

const app = fs.readFileSync('dadash-app.compiled.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const mustContain = [
  'window.__DMSG_OPEN_BOTTOM_SCROLL_GUARD="selected_conversation_bottom_first"',
  'var openBottomScrollGuardUntilRef=React.useRef(0)',
  'var forceOpenBottomScroll=useCallback(function forceOpenBottomScroll()',
  'openBottomScrollGuardUntilRef.current=Date.now()+900',
  'if(Date.now()<openBottomScrollGuardUntilRef.current){scrollToBottom("auto");return}',
  'forceOpenBottomScroll();var t=setTimeout(function(){forceOpenBottomScroll()},300)',
  'dadash-app.compiled.js?v=conv-bottom1',
  "const CACHE_NAME = 'dadash-conv-bottom1'",
];

for (const needle of mustContain) {
  const haystack = needle.includes('CACHE_NAME') ? sw : needle.includes('dadash-app.compiled.js') ? index + sw : app;
  if (!haystack.includes(needle)) {
    throw new Error(`Missing open-bottom scroll guard: ${needle}`);
  }
}

if (app.includes('if(scrollTop<50&&hasMoreMsgs&&!loadingMore){setLoadingMore(true);')) {
  throw new Error('Stale top-load trigger can still fire during conversation open');
}

console.log('V1 conversation open bottom scroll guard OK');
