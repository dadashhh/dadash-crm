const fs = require('fs');

const path = 'supabase/migrations/20260523_manager_chatter_own_tx_commission.sql';
const sql = fs.readFileSync(path, 'utf8');

const required = [
  "WHEN p.role = 'manager_chatter' THEN COALESCE(p.manager_commission_pct, 12)",
  'NEW.chatter_commission := v_net * chatter_comm_pct / 100',
  'v_amount := COALESCE(NEW.amount_chf, NEW.amount, 0)',
  'NEW.amount := COALESCE(NEW.amount, v_amount)',
];

for (const marker of required) {
  if (!sql.includes(marker)) {
    throw new Error(`missing migration marker: ${marker}`);
  }
}

console.log('manager_chatter own TX commission migration OK');
