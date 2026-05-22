#!/usr/bin/env node
const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('dadash-v1-ops-sync.js', 'utf8');

const indexNeedles = [
  'dadash-v1-ops-sync.js?v=lea-ops1',
];

const sourceNeedles = [
  'DADASH_V1_OPS_SYNC_VERSION',
  'dadash-v1-ops-sync',
  'data-state',
  'Dernier sync',
  'Reconnexion',
  'dadashSocketReady',
  'conv_updated',
  '/messages',
  'nativeFetch.apply(this, arguments)',
  'visibilitychange',
  'focus',
];

for (const needle of indexNeedles) {
  if (!index.includes(needle)) {
    throw new Error(`Missing V1 ops sync index marker: ${needle}`);
  }
}

for (const needle of sourceNeedles) {
  if (!source.includes(needle)) {
    throw new Error(`Missing V1 ops sync marker: ${needle}`);
  }
}

if (/send-(message|photo|video|media)/.test(source)) {
  throw new Error('Ops sync status script must not call live send endpoints');
}

console.log('V1 ops sync status markers OK');
