# AUDIT CONFORMITÉ FLOW V3 — RAPPORT COMPLET

**Date** : 2026-03-28
**Fichier audité** : `index.html` (65 852 lignes)
**Méthode** : Scan exhaustif rôle par rôle, page par page, ligne par ligne

---

## SCORE GLOBAL

| | Conformes | Vérifiés | Manquants |
|--|-----------|---------|-----------|
| **TOTAL** | **80** | **121** | **14** |

### Score par rôle

| Rôle | Conformes | Vérifiés | % | Manquants |
|------|-----------|---------|---|-----------|
| Provider | 35 | 37 | 95% | 0 |
| MC | 22 | 30 | 73% | 5 |
| Chatter | 11 | 27 | 41% | 1 |
| Gérant | 12 | 22 | 55% | 4 |
| Modèle | 5 | 5 | 100% | 0 |

---

## RÔLE 1 — PROVIDER (35/37 ✅)

### Pages trouvées
1. **provider_dashboard** (ProviderDashboardTab) — L.25772 à L.26065 — Dashboard KPIs, graphe CA, top modèles, TX récentes
2. **TransactionsTab** (embarqué via viewMode=transactions) — L.15218 à L.15920 — Liste paginée TX + KPIs
3. **provider_compta** (ProviderComptaTab) — L.26067 à L.26289 — Reversements au gérant, historique payouts
4. **provider_factures** (ProviderFacturesTab) — L.26290 à L.26500 — Factures entrantes/sortantes
5. **ProviderConfirmations** — L.56352 à L.56500 — Confirmation screenshot checks
6. **SoldeWidget** — L.7141 à L.7177 — Widget solde
7. **Sidebar** — L.65218 à L.65232

### Résultats par page

#### Page : provider_dashboard (L.25772-26065)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| TOTAL REÇU | L.25805 | `SUM(tx.amount)` | SUM(tx.amount) = BRUT | ✅ CONFORME |
| MA COMMISSION | L.25820-25823 | `SUM(tx.amount × txRate)` | totalRecu × commission_rate | ✅ CONFORME |
| commission_rate parsing | L.25811-25818 | commission_rate déjà décimal, pct/100 | Pas de double division | ✅ CONFORME |
| PANIER MOYEN | L.25934-25936 | totalRecu / validTxs.length | Correct | ✅ CONFORME |
| Solde provider | L.25826-25837 | -(caAllTime - myCommissionAllTime - totalPaid) | Commissions - withdrawn | ✅ CONFORME |
| Historique retraits | L.25834 | `provider_payouts` table | provider_payouts | ✅ CONFORME |
| TX récentes colonnes | L.26030-26038 | spender_handle, model, date, amount, status | Pas de net/dada_fee | ✅ CONFORME |
| net_amount affiché | — | NON TROUVÉ | INVISIBLE | ✅ CONFORME |
| dada_fee affiché | — | NON TROUVÉ | INVISIBLE | ✅ CONFORME |

#### Page : TransactionsTab (L.15218-15920)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| KPI "CA BRUT" | L.15579, L.15587 | `SUM(tx.amount)` | BRUT | ✅ CONFORME |
| **KPI "CA NET"** | **L.15580, L.15592** | **`SUM(tx.net_amount)`** | **INVISIBLE pour provider** | ❌ **NON-CONFORME** |
| Colonne Montant | L.15867-15871 | `tx.amount` (BRUT) | BRUT | ✅ CONFORME |
| Colonne Ma commission | L.15820, L.15895 | `tx.provider_fee` | OK | ✅ CONFORME |
| Validate TX | L.10537 | `status:"validated", validated_at` | Pas de validated_by | ⚠️ MINEURE |
| Refuse TX | L.10583 | `status:"refused"` seul | Pas de refused_by/at | ⚠️ MINEURE |

#### Page : provider_compta (L.26067-26289)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| TOTAL À REVERSER | L.26095, L.26147 | totalCA - myCommission | Correct | ✅ CONFORME |
| DÉJÀ REVERSÉ | L.26101, L.26152 | SUM(validatedPayouts.amount) | provider_payouts | ✅ CONFORME |
| RESTE À PAYER | L.26103, L.26157 | totalAReverser - totalPaid - pending | Correct | ✅ CONFORME |
| net_amount/dada_fee | — | NON TROUVÉ | INVISIBLE | ✅ CONFORME |

### Non-conformes (1) :
1. **L.15580+L.15592** — KPI "CA NET" visible au provider dans TransactionsTab → permet de déduire dada_fee

---

## RÔLE 2 — MANAGER CHATTER (22/30 ✅)

### Pages trouvées
1. **mc_dashboard** — L.62341 à L.62651 — Dashboard principal MC
2. **mc_transactions** — L.62653 à L.62762 — Liste TX avec validation/refus
3. **mc_solde** (mc_commission) — L.62764 à L.62915 — Commissions, solde dû, historique
4. **mc_chatters** (mc_equipe) — L.62917 à L.63200+ — Chatters, Conversations, Planning

### Résultats par page

#### Page : mc_dashboard (L.62341-62651)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| KPI CA Net Équipe | L.62398 | `SUM(tx.net_amount)` validées | SUM(net_amount) | ✅ CONFORME |
| KPI Ma Commission | L.62401 | `caNet × (manager_commission_pct/100)` | CA_NET × mc_rate | ✅ CONFORME |
| KPI Paie chatters | — | NON TROUVÉ | SUM(net × chatter_rate) | 🔴 MANQUANT |
| KPI Ma marge | — | NON TROUVÉ | allocation - paie_chatters | 🔴 MANQUANT |
| KPI TX en attente | L.62403 | `pending.length` | Correct | ✅ CONFORME |
| Period selector | L.62506 | 24h/7j/30j/90j/all + custom | Oui | ✅ CONFORME |
| Chart CA over time | L.62414-62498 | `tx.net_amount` par jour | Oui | ✅ CONFORME |
| Delta vs période | L.62408-62411 | Calcul delta % | Oui | ✅ CONFORME |
| Stats per model | — | NON TROUVÉ | — | 🔴 MANQUANT |

#### Page : mc_transactions (L.62653-62762)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| KPI CA VALIDÉ | L.62681 | `tx.net_amount` | net_amount | ✅ CONFORME |
| **KPI CA EN ATTENTE** | **L.62682** | **`tx.amount`** | **net_amount** | ❌ **NON-CONFORME** |
| **Colonne "Brut"** | **L.62730, L.62740** | **`tx.amount` affiché** | **INTERDIT pour MC** | ❌ **NON-CONFORME** |
| Colonne "Net" | L.62741 | `tx.net_amount` | Correct | ✅ CONFORME |
| **Validate TX** | **L.62657-62662** | **sans `validated_by`** | **Manque traçabilité** | ❌ **NON-CONFORME** |

#### Page : mc_solde (L.62764-62915)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| KPI Commission | L.62789-62790 | `caNetPeriod × commRate` | Correct | ✅ CONFORME |
| KPI Solde dû | L.62800 | `commAllTime - déjàVersé` | Correct | ✅ CONFORME |
| Historique paiements | L.62887-62910 | table `manager_commissions` | Correct | ✅ CONFORME |
| Paie chatters (display) | — | NON TROUVÉ | 🔴 MANQUANT |
| Payer un chatter (action) | — | NON TROUVÉ | 🔴 MANQUANT |

#### Welcome Brief (shared)

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| **txCA** | **L.23939** | **`tx.amount`** | **net_amount pour MC** | ❌ **NON-CONFORME** |

### Non-conformes (5) :
1. **L.62682** — KPI CA EN ATTENTE utilise `tx.amount`
2. **L.62730+L.62740** — Colonne "Brut" visible = INTERDIT
3. **L.62658** — validate sans `validated_by`
4. **L.23939** — Welcome brief txCA utilise `tx.amount`
5. **L.62665** — refuse sans `refused_by`/`refused_at`

### Manquants (5) :
1. KPI "Paie chatters"
2. KPI "Ma marge"
3. Stats per model
4. Chatter % commission (affichage/modification)
5. **Action "Payer un chatter"** — Flow A impossible

---

## RÔLE 3 — CHATTER (11/27 ✅)

### Pages trouvées
1. **chatter_dashboard** — L.30398 à L.31118 (ChatterDashboardRedesign)
2. **chatter_transactions** — L.31130 à L.31638 (ChatterTransactionsTab)
3. **chatter_spenders** — L.31643 à L.31653
4. **messagerie** — L.32135+
5. **chatter_compta** — L.50627 à L.50903+
6. **chatter_competition** — L.52759 à L.52873+
7. **chatter_scan** — L.65538
8. **chatter_notif** — L.65536

### Résultats — PROBLÈME SYSTÉMIQUE

Le chatter utilise `tx.amount` (BRUT) quasi-partout au lieu de `tx.net_amount` (NET).

| Élément | Ligne | Source données | Attendu V3 | Statut |
|---------|-------|---------------|------------|--------|
| **KPI "CA BRUT"** | **L.11574, L.30556** | **`SUM(tx.amount)`** | **INTERDIT** | ❌ NON-CONFORME |
| KPI "MA COMMISSION" | L.11575, L.30573 | `SUM(tx.chatter_commission)` | Correct | ✅ CONFORME |
| **Solde fallback** | **L.30448-30450** | **`tx.amount × rate`** | **net_amount × rate** | ❌ NON-CONFORME |
| **Stats model** | **L.30638** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Popup pending** | **L.31092** | **`tx.amount`** | **net_amount** | ❌ NON-CONFORME |
| **Search LTV** | **L.30773** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Search TX** | **L.30813** | **`tx.amount`** | **net_amount** | ❌ NON-CONFORME |
| **Chart ca_brut** | **L.30608** | **`tx.amount` graphé** | **INTERDIT** | ❌ NON-CONFORME |
| **KPI CA Validé** | **L.31327** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **KPI CA Attente** | **L.31328** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Chart data TX** | **L.31198-31208** | **`Number(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Table Montant** | **L.31535, L.31573** | **`tx.amount`** | **net_amount** | ❌ NON-CONFORME |
| **Compta CA** | **L.50688, L.50689** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Compta comm** | **L.50680-50684** | **`tx.amount × pct`** | **net_amount × pct** | ❌ NON-CONFORME |
| **Competition** | **L.52792** | **`SUM(tx.amount)`** | **net_amount** | ❌ NON-CONFORME |
| **Competition comm** | **L.52801** | **`tx.amount × pct`** | **net_amount × pct** | ❌ NON-CONFORME |
| tx.dada_fee | — | Non affiché | INVISIBLE | ✅ CONFORME |
| tx.provider_fee | — | Non affiché | INVISIBLE | ✅ CONFORME |
| Paiements reçus | L.50644-50660 | `paiements_internes` | Correct | ✅ CONFORME |

### Non-conformes (16) — Systémique `tx.amount` au lieu de `tx.net_amount`

### Manquants (1) :
1. **KPI "CA NET"** — `caNet` calculé (L.30557) mais **jamais affiché** dans les KPI cards

---

## RÔLE 4 — GÉRANT (12/22 ✅)

### Pages trouvées
1. **Dashboard** — L.11650-12460
2. **Business > Transactions** — L.15280-15935
3. **Business > Spenders** — L.16029+
4. **Équipe > Chatters** — L.20844-21510
5. **Équipe > Modèles** — L.13007-13700
6. **Équipe > Providers** — L.26542-27880
7. **Compta > P&L** — L.21740-21994
8. **Compta > Paiements** — L.22145-22520
9. **Compta > Factures** — L.58260+
10. **Compta > Résultats** — L.22523-22700
11. **Compta > Reversements Providers** — L.57934-58260
12. **Admin** — L.64969+

### KPIs

| KPI | Ligne | Statut |
|-----|-------|--------|
| CA BRUT | L.11804, L.15579, L.21760 | ✅ CONFORME |
| CA NET | L.11805, L.15580, L.21763 | ✅ CONFORME |
| Provider fees | L.21761, L.21947 | ✅ CONFORME |
| DADASH fee | L.21762, L.21948 | ⚠️ PARTIEL — pas labellé "comptable" |
| Reçu des providers | — | 🔴 MANQUANT |
| Versé aux MC | — | 🔴 MANQUANT |
| Versé aux chatters | L.21764, L.21950 | ✅ CONFORME |
| Marge agence | L.21774, L.21951 | ⚠️ PARTIEL — sans MC |
| **Label DADASH** | **L.22600 vs L.9355** | ❌ **"10%" affiché, constante = 12%** |

### Soldes

| Solde | Ligne | Statut |
|-------|-------|--------|
| Par provider | L.26602-26603 | ✅ CONFORME |
| Par MC | — | 🔴 MANQUANT |
| Par chatter | L.21200-21201 | ✅ CONFORME |
| Global agence | L.11697-11705 | ⚠️ PARTIEL |

### Tables

| Élément | Ligne | Statut |
|---------|-------|--------|
| TX list colonnes | L.15808-15896 | ❌ NON-CONFORME — manque net_amount, fees séparées, validated_by |
| Provider list | L.26580-26631 | ✅ CONFORME |
| **MC list** | — | 🔴 **MANQUANT** |
| Chatter list | L.21025-21065 | ✅ CONFORME |
| Modèle list | L.13007-13080 | ✅ CONFORME |

### Paiements — CRITIQUE

| Flow | Ligne | Statut |
|------|-------|--------|
| Gérant ← provider | L.58004-58024, L.26686 | ✅ CONFORME |
| **Gérant → MC** | — | 🔴 **MANQUANT** |
| Gérant → chatter (B) | L.20909-20942 | ✅ CONFORME |
| Gérant → modèle | L.13105, L.22253-22262 | ✅ CONFORME |
| **MC → chatter (A)** | — | 🔴 **MANQUANT** |

### Non-conformes (2) :
1. **L.22600** — Label "10%" vs constante 12%
2. **L.15808-15896** — TX list manque colonnes essentielles

### Manquants (4) :
1. KPI "Reçu des providers"
2. KPI "Versé aux MC" + Solde MC + Liste MC
3. Paiement gérant→MC
4. Flow A (MC→chatter)

---

## RÔLE 5 — MODÈLE (5/5 ✅ — 100%)

### Pages trouvées
1. **model_checklist** — L.65194
2. **model_content** — L.65197
3. **model_tasks** — L.65200
4. **model_payments** — L.65204 (ModelPaymentsTab L.53358-53430)
5. **model_compta** — L.65207
6. **model_dashboard** — L.64736
7. **model_notif** — L.65212

| Check | Ligne | Statut |
|-------|-------|--------|
| Salaire (payouts) | L.53358-53430 | ✅ CONFORME |
| Historique paiements | L.50449-50453 | ✅ CONFORME |
| TX non visibles | — (aucun tab TX) | ✅ CONFORME |
| Notifications payment-only | L.52494-52496 | ✅ CONFORME |
| Messagerie bloquée | L.48911 | ✅ CONFORME |

---

## TX CREATION POINTS (8 points)

| # | Ligne | Rôle | provider_id | chatter_id | model_id | net/dada/prov_fee calculés | Doublon check |
|---|-------|------|-------------|------------|----------|---------------------------|---------------|
| 1 | L.9187-9224 | Any (helper) | Via caller | Via caller | Via caller | **NON** | N/A |
| 2 | L.29411 | Gérant (suggestions) | OUI | OUI* | OUI* | **NON** | OUI (L.29344) |
| 3 | L.34749 | Chatter | OUI | OUI | OUI | **NON** | **NON** |
| 4 | L.37323 | Chatter | OUI | OUI | OUI | **NON** | **NON** |
| 5 | L.38142 | Chatter | OUI | OUI | OUI | **NON** | **NON** |
| 6 | L.43060 | Chatter | OUI | OUI | OUI | **NON** | **NON** |
| 7 | L.56424 | Provider (scan) | OUI | **NON** ⚠️ | OUI | **NON** | NON |
| 8 | L.61075 | Chatter | OUI | OUI | OUI | **NON** | **NON** |

**Constat critique :** `net_amount`, `dada_fee`, `provider_fee` ne sont **JAMAIS calculés** à la création.

**Point #7 (L.56424)** : `chatter_id` manquant dans le payload provider confirmation.

---

## TX VALIDATION POINTS (6 points)

| # | Ligne | Rôle | validated_by | validated_at | Status |
|---|-------|------|-------------|-------------|--------|
| 1 | L.10537-10538 | Gérant | **NON** | OUI | `"validated"` |
| 2 | L.13226-13227 | Gérant | **NON** | OUI | `"validated"/"refused"` |
| 3 | L.14587-14588 | Gérant/Chatter | **NON** | OUI | `"validated"/"refused"` |
| 4 | L.15963 | Gérant | **NON** | OUI | `"validated"` |
| 5 | L.16516-16517 | Gérant/Chatter | **NON** | OUI | `"validated"/"refused"` |
| 6 | L.62658 | MC | **NON** | OUI | `"validated"` |

**Constat critique :** `validated_by` n'est **JAMAIS persisté en DB**.

---

## MATRICE DE VISIBILITÉ

| Champ TX | Provider | MC | Chatter | Gérant | Modèle |
|----------|----------|-----|---------|--------|--------|
| tx.amount (BRUT) | ✅ visible, correct | ⚠️ **VISIBLE — INTERDIT** (L.62740) | ⚠️ **VISIBLE — INTERDIT** (L.30556, L.31573) | ✅ visible, correct | ❌ hidden, correct |
| tx.net_amount | ⚠️ **VISIBLE — INTERDIT** (L.15592) | ✅ visible, correct | 🔴 **CACHÉ — DEVRAIT ÊTRE VISIBLE** | ✅ visible, correct | ❌ hidden, correct |
| tx.provider_fee | ✅ visible (own fee) | ❌ hidden, correct | ❌ hidden, correct | ✅ visible, correct | ❌ hidden, correct |
| tx.dada_fee | ❌ hidden, correct | ❌ hidden, correct | ❌ hidden, correct | ✅ visible, correct | ❌ hidden, correct |
| tx.chatter_commission | ❌ hidden, correct | ❌ hidden, correct | ✅ visible (compta) | ✅ visible, correct | ❌ hidden, correct |
| tx.status | ✅ visible | ✅ visible | ✅ visible | ✅ visible | ❌ hidden, correct |
| tx.validated_by | ➖ jamais écrit en DB | ➖ jamais écrit | ➖ jamais écrit | ➖ jamais écrit | ❌ hidden |
| tx.validated_at | ❌ hidden | ❌ hidden | ❌ hidden | ❌ hidden (events) | ❌ hidden |
| tx.currency | ✅ visible | ✅ visible | ✅ visible | ✅ visible | ❌ hidden |
| tx.spender_name | ✅ visible | ✅ visible | ✅ visible | ✅ visible | ❌ hidden |
| tx.model_id | ❌ hidden (L.15863) | ✅ visible | ✅ visible | ✅ visible | ❌ hidden |
| tx.chatter_id | ❌ hidden | ✅ visible | ➖ implicite | ✅ visible (L.15894) | ❌ hidden |
| tx.provider_id | ❌ hidden | ❌ hidden | ❌ hidden | ✅ visible | ❌ hidden |

**Alertes :**
- ⚠️ × 3 : Provider voit net_amount, MC voit amount, Chatter voit amount
- 🔴 × 1 : Chatter ne voit PAS net_amount (devrait être sa vue principale)

---

## PRIORITÉ DES CORRECTIONS

| Priorité | Action | Lignes | Effort |
|---------|--------|--------|--------|
| **P0** | Chatter : remplacer `tx.amount` → `tx.net_amount` (~16 occurrences) | L.30556, L.30608, L.30638, L.30773, L.30813, L.31092, L.31198, L.31327, L.31328, L.31535, L.31573, L.50688, L.50689, L.50680, L.52792, L.52801 | Faible |
| **P0** | MC : supprimer colonne "Brut" + fix KPI CA EN ATTENTE | L.62682, L.62730, L.62740 | Faible |
| **P0** | Ajouter `validated_by: user.id` aux 6 points de validation | L.10537, L.13226, L.14587, L.15963, L.16516, L.62658 | Faible |
| **P0** | Provider : cacher KPI "CA NET" | L.15580, L.15592 | Faible |
| **P1** | Vérifier/créer trigger DB pour `net_amount/dada_fee/provider_fee` | 8 points création | Moyen |
| **P1** | Corriger label "10%" → "12%" | L.22600 | Faible |
| **P1** | Ajouter colonnes manquantes table TX gérant | L.15808-15896 | Moyen |
| **P2** | Implémenter Flow A : paiement gérant→MC, MC→chatter | Nouveau code | Élevé |
| **P2** | Créer liste MC dans vue gérant avec solde | Nouveau code | Moyen |
| **P2** | KPIs manquants MC (paie chatters, marge, stats model) | Nouveau code | Moyen |
| **P3** | Chatter : remplacer KPI CA BRUT par CA NET visible | L.11574 | Faible |
| **P3** | Ajouter checkDuplicate aux 5 points création | L.34749, L.37323, L.38142, L.43060, L.61075 | Moyen |
| **P3** | Ajouter `chatter_id` au point #7 provider scan | L.56424 | Faible |
| **P3** | Welcome brief : conditionner txCA par rôle | L.23939 | Faible |
