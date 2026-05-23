#!/usr/bin/env node
const fs = require('fs');

const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'manager_chatter:["mc_dashboard","chatter_transactions","mc_chatters","mc_solde","messagerie"]',
  'role==="chatter"||role==="manager_chatter"',
  '(_roleIs(user,"chatter")||_roleIs(user,"manager_chatter"))',
  'tab==="chatter_transactions"&&(_roleIs(user,"chatter")||_roleIs(user,"manager_chatter"))',
  'if(role==="manager_chatter")',
  'return 0.12',
  'sb.from("transactions").select("amount, net_amount, currency, chatter_commission").eq("chatter_id",user.id)',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing V1 manager_chatter TX marker: ${needle}`);
  }
}

if (source.includes('return role==="manager_chatter"?0.25')) {
  throw new Error('manager_chatter commission fallback is still 25%, expected 12%');
}

if (source.includes('tab==="chatter_transactions"&&_roleIs(user,"chatter")')) {
  throw new Error('chatter_transactions route is still hidden from manager_chatter');
}

console.log('TX manager_chatter self-create markers OK');
