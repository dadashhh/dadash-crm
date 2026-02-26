# QA FINALE — Audit complet + Corrections DADASH CRM

## Résumé des phases

| Phase | Statut | Fichiers modifiés |
|-------|--------|-------------------|
| 0 — Audit | OK | `scripts/audit_supabase.sql`, `scripts/audit_runtime.md` |
| 1 — Dashboard data | OK | `index.html` (DashboardTab), `supabase/migrations/20260311_fix_dashboard_rls_seed.sql` |
| 2 — Payments/Ledger | OK | `index.html` (PayesTab, ChatterComptaTab), `supabase/migrations/20260311_fix_payments_ledger_definitive.sql` |
| 3 — Bot enrich + TG push | OK | `worker/src/enrich.ts`, `worker/src/index.ts`, `supabase/migrations/20260311_spender_enrich_queue.sql`, `scripts/backfill_enrich_queue.sql` |

---

## 10 checks manuels rapides

### 1. Dashboard non-zero (gerant)
```
1. Connectez-vous en tant que gérant
2. Ouvrez le Dashboard
3. Sélectionnez "Tout" (All) dans le sélecteur de période
4. Vérifiez: CA Brut > 0, Net > 0, NB TX > 0
5. Si 0: basculez sur "Tout" → si encore 0: exécutez le seed SQL
```

**Seed SQL** (si aucune donnée) :
```sql
-- Exécutez 20260311_fix_dashboard_rls_seed.sql dans le SQL Editor Supabase
```

### 2. Sélecteur de période Dashboard
```
1. Cliquez 7j / 30j / 90j / Tout
2. Les KPIs doivent changer selon la période
3. Si 0 sur 7j mais > 0 sur Tout → message explicatif avec bouton "Voir toutes les périodes"
```

### 3. Spenders cards créées
```
1. Allez dans Business > Spenders
2. Vérifiez qu'il y a au moins 1 card avec LTV
3. Cliquez sur un spender → profil détaillé s'ouvre
```

### 4. P&L Statement (Compta > P&L)
```
1. Allez dans Compta > P&L
2. Sélectionnez "Tout" dans le filtre date
3. Vérifiez: CA Brut, Net, Commissions, Marge brute, Profit net
4. Export CSV et PDF doivent fonctionner
```

### 5. Payment → Paid → Ledger OK
```sql
-- Dans le SQL Editor Supabase:
-- Exécutez supabase/migrations/tests_payments_ledger.sql
-- Attendu: "TOUS LES TESTS PASSÉS"
```

OU manuellement :
```
1. Gérant: Compta > Paies
2. Cliquez "Marquer payé" sur un bénéficiaire avec solde > 0
3. Vérifiez: toast "Marqué payé ✓"
4. Rafraîchissez: le solde doit diminuer
```

### 6. Ledger entries vérification
```sql
SELECT entry_type, COUNT(*), SUM(amount) FROM ledger_entries GROUP BY entry_type;
-- Attendu: entry_type = 'debit' et 'credit' uniquement, amounts > 0
-- Si 'payer_debit' ou 'receiver_credit' subsistent: exécutez 20260311_fix_payments_ledger_definitive.sql
```

### 7. Notification in-app chatter
```
1. Créez un payment_event: gérant → chatter, status = paid
2. Connectez-vous en tant que chatter
3. Vérifiez: notification bell (cloche) montre "Paiement reçu"
4. Cliquez → marqué comme lu
```

### 8. Chatter espace compta
```
1. Connectez-vous en tant que chatter
2. Allez dans l'onglet "Compta"
3. Vérifiez: Solde actuel, Paiements en attente, Historique
4. Le solde doit refléter les ledger entries
```

### 9. Enrich worker
```bash
# Sur Railway ou en local:
cd worker && npm run build && node dist/index.js

# Logs attendus:
# [HEALTH] HTTP server listening on :3000 — GET /health
# [POLLER] Started (interval=5000ms, batch=50)
# [ENRICH] Started (interval=10000ms, worker=enrich-...)

# Si spender_enrich_queue n'existe pas:
# [ENRICH] spender_enrich_queue table not found — skipping enrich poller
```

Backfill des conversations existantes :
```sql
-- Exécutez scripts/backfill_enrich_queue.sql dans le SQL Editor
```

### 10. Notification Telegram manager
```
1. Configurez MANAGER_TG_CHAT_ID dans les env vars Railway
2. Créez un payment_event status=paid
3. Vérifiez: le bot envoie "Paiement effectué" dans le chat Telegram
4. Si enrich fonctionne: "Nouveau spender" ou "Profil enrichi" envoyé aussi
```

---

## Migrations SQL à exécuter (dans l'ordre)

```
1. supabase/migrations/20260311_fix_dashboard_rls_seed.sql
2. supabase/migrations/20260311_fix_payments_ledger_definitive.sql
3. supabase/migrations/20260311_spender_enrich_queue.sql
4. scripts/backfill_enrich_queue.sql  (optionnel, une seule fois)
```

---

## Commandes exactes

### Déploiement local
```bash
# App (ouvrir index.html dans le navigateur, rien à build)
open index.html

# Worker Railway (local dev)
cd worker
npm install
npm run build
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx TELEGRAM_BOT_TOKEN=xxx node dist/index.js
```

### Test worker enrich
```bash
cd worker
npm run build
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx TELEGRAM_BOT_TOKEN=xxx MANAGER_TG_CHAT_ID=xxx node dist/index.js
```

### Vérification healthcheck
```bash
curl http://localhost:3000/health | jq
# Attendu: {"status":"ok","alerts":{...},"enrich":{...}}
```

---

## Ce qui pourrait encore être à 0 et pourquoi

| Situation | Cause | Solution |
|-----------|-------|----------|
| Dashboard KPIs = 0 sur 7j | Pas de TX dans les 7 derniers jours | Sélectionner "Tout" ou créer des TX récentes |
| Dashboard KPIs = 0 sur "Tout" | Table `transactions` vide | Exécuter le seed SQL (Phase 1 migration) |
| Dashboard CA Brut = 0 mais NB TX > 0 | TX sans `amount` renseigné | Vérifier le schéma transactions (colonne amount) |
| Ledger vide | Trigger non exécuté | Exécuter la migration Phase 2, puis re-tester mark paid |
| Chatter compta vide | RLS bloque | Vérifier `le_select_own` policy sur ledger_entries |
| Enrich ne tourne pas | Table `spender_enrich_queue` absente | Exécuter migration Phase 3 |
| TG push ne fonctionne pas | `MANAGER_TG_CHAT_ID` non configuré | Ajouter la variable env sur Railway |
| TX en EUR mais affichage CHF = 0 | Filtre devise | Le Dashboard convertit toutes les devises, pas de filtre strict |

---

## Causes racines identifiées (synthèse)

### Phase 1 — Dashboard vide
1. **KPI 7j hardcodé** : Le DashboardTab ne regardait que les 7 derniers jours. Sans TX récentes → 0.
2. **Pas de filtre status** : TX pending/refused comptaient dans les KPIs bruts.
3. **net_amount null** : Beaucoup de TX n'ont pas `net_amount` rempli → fallback sur `amount`.
4. **Policy le_all_gerant manquante** : Le gérant ne voyait pas les ledger_entries.

### Phase 2 — Payments/Ledger cassé
1. **3 versions de fn_payment_event_paid** : entry_type incohérent entre migrations.
2. **Amount négatif** : `manager_notifier.sql` stockait `-amount` → violait CHECK (amount > 0).
3. **Pas d'idempotence** : Le trigger pouvait créer des doublons de ledger entries.
4. **RLS INSERT ledger** : Une ancienne policy `le_insert_gerant` bloquait les inserts du trigger SECURITY DEFINER.

### Phase 3 — Bot/Enrich absent
1. **Pas de table spender_enrich_queue** : Le concept existait dans la spec mais n'était pas implémenté.
2. **Pas de worker d'enrichissement** : Le worker existant ne faisait que du polling d'alertes.
3. **Pas de push TG manager** : Les alertes étaient insérées en DB mais le push pour l'enrich n'existait pas.
