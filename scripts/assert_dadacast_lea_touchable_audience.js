#!/usr/bin/env node
const fs = require('fs');
const source = fs.readFileSync('dadash-app.compiled.js', 'utf8');

const mustContain = [
  'DADACAST_LEA_TOUCHABLE_IDS',
  '/api/dadacast/audience-counts?include_chat_ids=true',
  'chat_ids_by_name',
  'DADACAST_TOUCHABLE_CHAT_IDS(Array.from(selectedConvIds)',
  'dadashAudiencePool',
  'modelName.toLowerCase()==="lea"',
  'isSelectedLea',
];

for (const needle of mustContain) {
  if (!source.includes(needle)) {
    throw new Error(`Missing Lea touchable audience marker: ${needle}`);
  }
}

if (source.includes('var pool=modelConvs;if(selectedTier!=="all")')) {
  throw new Error('Dadacast still builds Lea selection from all modelConvs');
}

if (source.includes('chatIds=DADACAST_SAFE_CHAT_IDS(Array.from(selectedConvIds))')) {
  throw new Error('Dadacast still sends from selectedConvIds without Lea touchable filter');
}

if (source.includes('var effectiveRecipients=selectedTier==="all"&&dbAudience!=null?dbAudience:selectedConvIds.size;')) {
  throw new Error('Dadacast preview still prefers raw db audience count for Lea "all" segment');
}

if (source.includes('counts[t.id]=dbAllCount!==null&&dbAllCount!==void 0?dbAllCount:dadashAudiencePool.length;')) {
  throw new Error('Dadacast all segment still prefers raw db audience count over touchable Lea pool');
}

console.log('Dadacast Lea touchable audience markers OK');
