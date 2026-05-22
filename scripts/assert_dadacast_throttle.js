#!/usr/bin/env node
const fs = require('fs');
const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'DADACAST_MIN_SPACING_MS',
  'DADACAST_JITTER_MS',
  'DADACAST_MIN_SPACING_MS+DADACAST_JITTER_MS/2',
  'setTimeout(r,DADACAST_MIN_SPACING_MS+Math.random()*DADACAST_JITTER_MS)',
  'DADACAST_SAFE_CHAT_IDS',
  'DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds))',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing Dadacast throttle marker: ${needle}`);
  }
}

if (source.includes('setTimeout(r,2000+Math.random()*3000)')) {
  throw new Error('Dadacast still uses unsafe 2-5s spacing');
}

if (source.includes('chatIds=Array.from(selectedConvIds);')) {
  throw new Error('Dadacast still sends to unfiltered selectedConvIds');
}

console.log('Dadacast throttle markers OK');
