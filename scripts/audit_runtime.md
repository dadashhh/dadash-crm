# Audit Runtime — Checklist d'exécution

## Pré-requis
- Accès au SQL Editor Supabase (Dashboard)
- App ouverte dans un navigateur (DevTools ouvert, onglet Console)
- Un user gerant connecté

---

## A. Côté DB — Exécuter `scripts/audit_supabase.sql`

1. Copier-coller le contenu de `scripts/audit_supabase.sql` dans le SQL Editor Supabase
2. Exécuter et sauvegarder les résultats
3. Vérifier :
   - [ ] Colonnes `transactions` : `id, date, amount, currency, status, spender_handle, model_id, chatter_id, net_amount, provider_fee, dada_fee, chatter_commission`
   - [ ] Colonnes `ledger_entries` : `id, owner_user_id, counterparty_user_id, entry_type, amount, currency, note, payment_event_id, created_by`
   - [ ] Colonnes `payment_events` : `id, from_user_id, to_user_id, amount, currency, status, kind, note, title, created_by`
   - [ ] CHECK constraint `ledger_entries_amount_check` : `amount > 0`
   - [ ] CHECK constraint `ledger_entries_entry_type_check` : `entry_type IN ('debit','credit')` ou `('payer_debit','receiver_credit')`
   - [ ] Trigger `trg_payment_event_paid` existe et est enabled
   - [ ] Trigger `trg_payment_event_paid_insert` existe et est enabled
   - [ ] Policy `transactions_all_gerant` existe pour SELECT/ALL
   - [ ] Policy `le_select_own` sur ledger_entries (owner_user_id = auth.uid())
   - [ ] Row count transactions > 0
   - [ ] Row count profiles > 0 (au moins 1 gerant + 1 chatter)

---

## B. Côté App — Console DevTools

### B1. Vérifier le user connecté
```js
// Dans la console du navigateur :
window.sb.auth.getSession().then(({data}) => {
  console.log('Session:', data.session?.user?.id);
  console.log('Email:', data.session?.user?.email);
});
```

### B2. Vérifier que loadData retourne des données
```js
// Tester les queries principales manuellement :
window.sb.from('transactions').select('*', {count:'exact'}).limit(5)
  .then(r => console.log('TX:', r.count, 'rows, sample:', r.data?.[0]));

window.sb.from('spenders').select('*', {count:'exact'}).limit(5)
  .then(r => console.log('Spenders:', r.count, 'rows'));

window.sb.from('profiles').select('id, role, name').then(r => {
  console.log('Profiles:', r.data?.map(p => p.role + ':' + p.name));
});

window.sb.from('payment_events').select('*', {count:'exact'}).limit(5)
  .then(r => console.log('PaymentEvents:', r.count));

window.sb.from('ledger_entries').select('*', {count:'exact'}).limit(5)
  .then(r => console.log('Ledger:', r.count));

window.sb.from('notifications').select('*', {count:'exact'}).limit(5)
  .then(r => console.log('Notifs:', r.count));
```

### B3. Vérifier les KPIs Dashboard
```js
// Observer dans la console les logs [DADASH] au chargement
// Chercher :
// - "[DADASH] Query error (transactions):" → RLS ou schéma
// - "[DADASH] loadData failed:" → timeout ou crash
// - "[DADASH Compta]" → logs du PayesTab
```

---

## C. Côté Auth — Rôle et permissions

### C1. Identifier le rôle du user
```js
window.sb.auth.getSession().then(async ({data}) => {
  if (!data.session) { console.log('Pas connecté'); return; }
  const uid = data.session.user.id;
  const {data: p} = await window.sb.from('profiles').select('role, name, assigned_models').eq('id', uid).single();
  console.log('User:', uid);
  console.log('Role:', p?.role);
  console.log('Name:', p?.name);
  console.log('Assigned models:', p?.assigned_models);
});
```

### C2. Test RLS direct
```js
// Si gerant, doit voir TOUTES les transactions :
window.sb.from('transactions').select('id', {count:'exact', head:true})
  .then(r => console.log('TX visible count:', r.count, 'error:', r.error?.message));

// Si chatter, doit voir seulement ses TX (assigned_models) :
// → comparer avec le count total via service role
```

---

## D. Résultat attendu

| Check | Attendu | Réel |
|-------|---------|------|
| Transactions rows > 0 | oui | |
| Spenders rows > 0 | oui | |
| Profiles: ≥1 gerant + ≥1 chatter | oui | |
| Gerant voit toutes les TX (RLS) | oui | |
| Dashboard KPIs non-zero | oui (si TX existent) | |
| Ledger entry_type cohérent | debit/credit | |
| Trigger fn_payment_event_paid enabled | oui | |
| Payment → paid → 2 ledger entries | oui | |
| Notification créée pour receiver | oui | |
