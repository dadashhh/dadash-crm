#!/usr/bin/env node
const fs = require('fs');

const file = 'dadash-app.compiled.js';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Missing patch target: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'manager_chatter:["mc_dashboard","mc_chatters","mc_solde","messagerie"]',
  'manager_chatter:["mc_dashboard","chatter_transactions","mc_chatters","mc_solde","messagerie"]',
  'ROLE_ACCESS manager_chatter transactions tab',
);

replaceOnce(
  'if(_roleIs(user,"manager_chatter"))return{type:"manager_chatter",manager_user_id:user.id,email:user.email};',
  'if(_roleIs(user,"manager_chatter"))return{type:"chatter",chatter_user_id:user.id,manager_user_id:user.id,email:user.email};',
  'manager_chatter query scope',
);

replaceOnce(
  'var getCommissionRate=function getCommissionRate(profile,role){if((profile===null||profile===void 0?void 0:profile.commission_pct)!=null&&profile.commission_pct>0){return profile.commission_pct/100}if((profile===null||profile===void 0?void 0:profile.commission_rate)!=null&&profile.commission_rate>0){return profile.commission_rate}return role==="manager_chatter"?0.25:role==="provider"?0.1:0.2};',
  'var getCommissionRate=function getCommissionRate(profile,role){if(role==="manager_chatter"){if((profile===null||profile===void 0?void 0:profile.manager_commission_pct)!=null&&profile.manager_commission_pct>0){return profile.manager_commission_pct/100}if((profile===null||profile===void 0?void 0:profile.commission_pct)!=null&&profile.commission_pct>0){return profile.commission_pct/100}if((profile===null||profile===void 0?void 0:profile.commission_rate)!=null&&profile.commission_rate>0){return profile.commission_rate}return 0.12}if((profile===null||profile===void 0?void 0:profile.commission_pct)!=null&&profile.commission_pct>0){return profile.commission_pct/100}if((profile===null||profile===void 0?void 0:profile.commission_rate)!=null&&profile.commission_rate>0){return profile.commission_rate}return role==="provider"?0.1:0.2};',
  'manager_chatter commission fallback',
);

replaceOnce(
  'if(_roleIs(user,"chatter")){_setTab("chatter_transactions");window.history.pushState({tab:"chatter_transactions"},"","#chatter_transactions")}else{navigateTo("dashboard")}',
  'if(_roleIs(user,"chatter")||_roleIs(user,"manager_chatter")){_setTab("chatter_transactions");window.history.pushState({tab:"chatter_transactions"},"","#chatter_transactions")}else{navigateTo("dashboard")}',
  'FAB create_tx manager_chatter routing',
);

replaceOnce(
  '(isGerant||_roleIs(user,"chatter"))&&function(){var fabActions=isGerant?FAB_ACTIONS_GERANT:FAB_ACTIONS_CHATTER;',
  '(isGerant||_roleIs(user,"chatter")||_roleIs(user,"manager_chatter"))&&function(){var fabActions=isGerant?FAB_ACTIONS_GERANT:FAB_ACTIONS_CHATTER;',
  'FAB visibility manager_chatter',
);

replaceOnce(
  '{id:"chatter_transactions",icon:"\\uD83D\\uDCB0",label:t(lang,"transactions"),show:role==="chatter"}',
  '{id:"chatter_transactions",icon:"\\uD83D\\uDCB0",label:t(lang,"transactions"),show:role==="chatter"||role==="manager_chatter"}',
  'sidebar transactions manager_chatter',
);

replaceOnce(
  'tab==="chatter_transactions"&&_roleIs(user,"chatter")&&React.createElement(ChatterTransactionsTab',
  'tab==="chatter_transactions"&&(_roleIs(user,"chatter")||_roleIs(user,"manager_chatter"))&&React.createElement(ChatterTransactionsTab',
  'route render manager_chatter transactions tab',
);

fs.writeFileSync(file, source);

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('window.__buildId = "55a58fe";', 'window.__buildId = "mc-tx1";');
html = html.replace('./dadash-app.compiled.js?v=lea-id1', './dadash-app.compiled.js?v=mc-tx1');
fs.writeFileSync('index.html', html);

console.log('patched V1 manager_chatter TX access');
