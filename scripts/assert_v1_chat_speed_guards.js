#!/usr/bin/env node
const fs = require('fs');
const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'DMSG_SEND_FLIGHT_TTL_MS',
  '_DMSG_SEND_FLIGHTS',
  'dadashDmsgSendSettled',
  '_dmsgInvalidateAfterSend',
  '_dmsgFetchRaw',
  'window.addEventListener("focus",onVisible)',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing V1 chat speed guard: ${needle}`);
  }
}

if (!source.includes('delete _DMSG_MSG_CACHE[String(chatId)]')) {
  throw new Error('Message cache is not invalidated after send');
}

if (!source.includes('_DMSG_CONV_CACHE.ts=0')) {
  throw new Error('Conversation cache is not invalidated after send');
}

if (!source.includes('return _DMSG_SEND_FLIGHTS[flightKey].promise')) {
  throw new Error('Duplicate in-flight send requests are not single-flighted');
}

console.log('V1 chat speed guards OK');
