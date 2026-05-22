#!/usr/bin/env node
const fs = require('fs');
const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'dadashSocketReady',
  'DMSG_SOCKET_BIND_ATTEMPTS',
  'DMSG_CONV_POLL_MS',
  'DMSG_CONV_CACHE_TTL_MS',
  'loadConversationsRef.current(true)',
  'var delay=idleMs>30000?5000:1500;',
  'DMSG live refresh markers OK',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing V1 realtime refresh marker: ${needle}`);
  }
}

if (source.includes('var CACHE_TTL=120000;')) {
  throw new Error('Conversation cache still allows 120s stale list');
}

if (source.includes(')),60000);return function(){return clearInterval(convPollRef.current)}')) {
  throw new Error('Conversation polling is still 60s');
}

if (source.includes('var delay=idleMs>30000?10000:3000;')) {
  throw new Error('Active message polling is still 3s/10s');
}

if (source.includes('var socket=window.__dadashSocket;if(!socket)return;var onMessageRead=')) {
  throw new Error('Socket listener still gives up if socket is not ready on mount');
}

console.log('DMSG live refresh markers OK');
