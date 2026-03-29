# AUDIT : Champs CA, Commission, Solde dans ChattersTab

**Date :** 2026-03-29
**Fichier analysé :** `index.html`
**Scope :** ChattersTab (2 implémentations), KPI bar, MC cards, P&L tab

---

## 1. Champs de la table `transactions` (côté code)

| Champ DB             | Usage dans le code                                                                 | Signification probable                |
|----------------------|------------------------------------------------------------------------------------|---------------------------------------|
| `amount`             | Utilisé dans ChattersTab principal (L19997) comme CA brut                          | Montant brut spender                  |
| `net_amount`         | Utilisé dans `computeChatterStats` (L19491) et P&L (L20788)                       | Montant net après fees                |
| `chatter_commission` | Utilisé dans commDue si > 0 (L20005), et dans P&L `txComm` (L20789)              | Commission chatter pré-calculée en DB |
| `provider_fee`       | Affiché pour providers (L15537), utilisé dans P&L (L20790)                         | Fee prélevée par le provider          |
| `dada_fee`           | Utilisé dans P&L (L20791)                                                          | Fee DADASH (12% du brut, cf `DADA_FEE_PCT=12`) |
| `currency`           | Conversion via `convertAmount()` dans tous les calculs                             | Devise de la TX                       |
| `status`             | Filtrage `isValidTx()` (validated, confirmee, payee…)                              | Statut de validation                  |

**Trigger `calc_transaction_fees` :** Aucune référence trouvée dans le codebase. Le calcul des fees semble être fait soit côté DB (trigger non visible dans le code front), soit manuellement.

### Requêtes SQL — NON EXÉCUTÉES

> ⚠ Pas de credentials Supabase disponibles dans l'environnement. Les 2 requêtes demandées n'ont pas pu être exécutées. Il faut les lancer manuellement depuis le dashboard Supabase.

```sql
-- Requête 1 : Échantillon transactions
SELECT id, amount, net_amount, chatter_commission, provider_fee, dada_fee, currency, status
FROM transactions
WHERE status IN ('validated', 'valid', 'confirmee')
ORDER BY created_at DESC
LIMIT 10;

-- Requête 2 : Profils chatters/MC
SELECT name, role, commission_pct, commission_rate, comm_pct, manager_commission_pct
FROM profiles
WHERE role IN ('chatter', 'manager_chatter')
ORDER BY role, name;
```

---

## 2. Tableau : Label UI → Variable → Source DB → Formule → Brut ou Net

### ChattersTab principal (composant `ChattersTab`, L19808+)

| Label UI          | Variable code   | Source DB                          | Formule                                                                 | Brut/Net      |
|-------------------|-----------------|------------------------------------|-------------------------------------------------------------------------|---------------|
| **CA ÉQUIPE** (KPI) | `totalValidCA`  | `tx.amount`                        | `Σ convertAmount(tx.amount, tx.currency)` pour TX validées              | **BRUT** ⚠    |
| **COMMISSIONS DUES** (KPI) | `totalCommDue` | `tx.chatter_commission` ou `tx.amount` × `ch.commission_rate` | `Σ (chatter_commission > 0 ? chatter_commission : amount × rate)` | **Mixte** ⚠  |
| **CA GÉNÉRÉ** (carte chatter) | `ch.validCA` | `tx.amount`                      | `Σ convertAmount(tx.amount, tx.currency)` pour TX validées du chatter   | **BRUT** ⚠    |
| **COMMISSION** (carte chatter) | `ch.commDue` | `tx.chatter_commission` ou `tx.amount` × `ch.commission_rate` | Idem totalCommDue par chatter | **Mixte** ⚠  |
| **CA Net** (carte MC)   | `mc.caNet`      | Somme des `validCA` des chatters assignés | `Σ assignedChatters.validCA`                                     | **BRUT** ⚠ (label trompeur) |
| **Allocation (X%)** (carte MC) | `mc.allocation` | `mc.caNet` × `mc.commPct`      | `caNet × commPct / 100`                                                 | Calculé sur BRUT ⚠ |
| **Déjà versé** (carte MC) | `mc.dejaVerse` | `paiements_internes.montant`     | `Σ montant` des paiements validated (type mc_payment ou commission)      | — |
| **Solde dû** (carte MC) | `mc.soldeDu`   | Calculé                            | `Math.round(allocation - dejaVerse)`                                    | — |
| **Solde dû** (carte chatter) | `soldeDu` (local) | Calculé                       | `Math.round(ch.commDue - dejaVerse)`                                   | — |

### Taux de commission utilisés

| Rôle              | Variable code                  | Source DB                                          | Défaut      |
|-------------------|--------------------------------|----------------------------------------------------|-------------|
| Chatter (principal) | `commRate`                   | `ch.commission_rate` (decimal, ex: 0.20)           | **0.20 (20%)** |
| Chatter (alternatif) | `commPct`                  | `ch.commission_pct` (entier, ex: 3)                | **3 (3%)**  |
| Manager Chatter (principal) | `commPct`            | `mc.manager_commission_pct ?? mc.commission_pct`   | **25 (25%)** |
| Manager Chatter (alternatif) | `commPct`           | `mc.manager_commission_pct ?? mc.commission_pct`   | **5 (5%)**  |
| Nouveau chatter (création) | `commission_pct`        | Formulaire de création (L19563)                    | **3**       |

---

## 3. Les 2 implémentations et leurs différences

Il existe **2 implémentations concurrentes** du calcul chatter :

### Implémentation A — `chatterStats` useMemo (L19992)
Utilisée dans le composant `ChattersTab` (L19808+).

```javascript
// L19997 — validCA utilise tx.amount (BRUT)
const validCA = validTx.reduce((s,tx) => s + convertAmount(Number(tx.amount), tx.currency), 0);

// L20002 — commRate est un décimal (0.20 = 20%)
const commRate = Number(ch.commission_rate || 0.20);

// L20004 — commDue : chatter_commission explicite OU amount × rate
const commDue = validTx.reduce((s,tx) => {
  const explicit = Number(tx.chatter_commission || 0);
  return s + convertAmount(explicit > 0 ? explicit : Number(tx.amount||0) * commRate, tx.currency);
}, 0);
```

### Implémentation B — `computeChatterStats` (L19486)
Utilisée dans un autre contexte du même fichier.

```javascript
// L19491 — validCA utilise net_amount avec fallback sur amount (NET préféré)
const validCA = validTx.reduce((s,tx) => s + convertAmount(Number(tx.net_amount || tx.amount || 0), tx.currency), 0);

// L19493 — commPct est un entier (3 = 3%)
const commPct = Number(ch.commission_pct || 3);

// L19494 — commission = validCA × commPct / 100 (pas de fallback sur chatter_commission)
const commission = validCA * commPct / 100;
```

---

## 4. Incohérences trouvées

### INCOHÉRENCE 1 — `amount` vs `net_amount` (CRITIQUE)
- **Implémentation A** (ChattersTab principal, L19997) : `validCA` = `Σ tx.amount` → **BRUT**
- **Implémentation B** (computeChatterStats, L19491) : `validCA` = `Σ (tx.net_amount || tx.amount)` → **NET (avec fallback brut)**
- **Conséquence :** Le même label "CA" montre un montant différent selon le contexte.

### INCOHÉRENCE 2 — Taux de commission (CRITIQUE)
- **Implémentation A** : `commission_rate` (decimal), défaut **0.20 (20%)**
- **Implémentation B** : `commission_pct` (entier), défaut **3 (3%)**
- **Conséquence :** Un chatter sans taux configuré aura une commission de 20% dans un onglet et 3% dans l'autre. Écart x6.7.

### INCOHÉRENCE 3 — Calcul de commission (MAJEUR)
- **Implémentation A** : Utilise `tx.chatter_commission` si > 0, sinon `amount × rate`
- **Implémentation B** : Toujours `validCA × commPct / 100`, ignore `tx.chatter_commission`
- **Conséquence :** Si `chatter_commission` est renseigné en DB, les deux calculs divergent.

### INCOHÉRENCE 4 — Label "CA Net" des MC (TROMPEUR)
- Le label affiché est **"CA Net"** (L20187)
- Mais la variable `caNet` = `Σ assignedChatters.validCA` qui utilise `tx.amount` (BRUT) dans l'implémentation A
- **Conséquence :** Le label dit "Net" mais le chiffre est BRUT.

### INCOHÉRENCE 5 — Défaut MC commission (MINEUR)
- **Implémentation A** (L20046) : défaut `25%`
- **Implémentation B** (L19510) : défaut `5%`
- **Conséquence :** Un MC sans `manager_commission_pct` configuré verra 25% ou 5% selon le contexte.

### INCOHÉRENCE 6 — KPI "COMMISSIONS DUES" (SÉMANTIQUE)
- **Implémentation A** (L20038) : `totalCommDue` = `Σ ch.commDue` (somme des commissions calculées, sans déduction des versements)
- **Implémentation B** (L19524) : `kpiCommDues` = `Σ max(0, soldeDu)` (somme des soldes restants après déduction des versements)
- **Conséquence :** Le même KPI "COMMISSIONS DUES" montre soit le total brut des commissions (A), soit le restant dû après paiements (B). Sémantiquement, B est correct.

---

## 5. Cohérence avec le flow TX cible

**Flow cible rappelé :**
> Spender paie X (brut) → Provider prend son % → DADASH prend 12% du brut → Net → MC prend ~25% du net → Chatters sur part MC

### Est-ce que `net_amount` = `amount - provider_fee - dada_fee` ?

**Indéterminé côté code front.** Le P&L (L20794-20797) calcule séparément :
- `grossRev` = `Σ tx.amount`
- `totalProvFees` = `Σ tx.provider_fee`
- `totalDadaFees` = `Σ tx.dada_fee`
- `totalNet` = `Σ tx.net_amount`

Il n'y a pas de vérification dans le code que `net_amount == amount - provider_fee - dada_fee`. Cela dépend du trigger/backend DB.

### La commission chatter est-elle calculée sur le NET ?

**NON dans l'implémentation A** — elle est calculée sur `tx.amount` (BRUT) ou sur `tx.chatter_commission` pré-calculé.
**PARTIELLEMENT dans l'implémentation B** — elle est calculée sur `tx.net_amount || tx.amount`, donc sur le NET si renseigné.

### La commission MC est-elle sur le NET des chatters ?

**NON** — `mc.caNet` = somme des `validCA` des chatters, qui dans l'implémentation A est basé sur `tx.amount` (BRUT). L'allocation MC est donc calculée sur du BRUT malgré le label "CA Net".

---

## 6. Recommandations

| Label UI              | Champ DB à utiliser      | Formule recommandée                                          |
|-----------------------|--------------------------|--------------------------------------------------------------|
| **CA GÉNÉRÉ** (chatter) | `tx.net_amount`         | `Σ convertAmount(tx.net_amount, currency)` — c'est du NET   |
| **COMMISSION** (chatter) | `tx.chatter_commission` ou `net_amount × rate` | Prioriser `chatter_commission` si renseigné, sinon `net_amount × commission_pct/100` |
| **CA Net** (MC)        | Dérivé du NET des chatters | `Σ chatters.validCA` (si validCA est déjà NET)              |
| **COMMISSIONS DUES** (KPI) | Soldes restants      | `Σ max(0, soldeDu)` après déduction des versements          |
| Taux chatter           | `commission_pct` (entier) | Unifier sur un seul champ, supprimer `commission_rate`      |
| Taux MC                | `manager_commission_pct`  | Défaut cohérent (choisir 5% ou 25%, documenter)             |

### Actions prioritaires :
1. **Unifier les 2 implémentations** — garder une seule source de vérité pour `validCA` et `commDue`
2. **Utiliser `net_amount`** partout au lieu de `amount` pour les labels CA
3. **Unifier `commission_rate` et `commission_pct`** — un seul champ, un seul format
4. **Vérifier en DB** que `net_amount = amount - provider_fee - dada_fee` (exécuter les requêtes SQL)
5. **Renommer le label** "CA Net" des MC ou corriger le calcul pour qu'il soit réellement net
6. **Harmoniser les défauts** de commission (3% vs 20% pour chatters, 5% vs 25% pour MC)

---

## Annexe : Localisation du code

| Élément                          | Ligne     |
|----------------------------------|-----------|
| `DADA_FEE_PCT = 12`             | 9057      |
| `computeChatterStats` (impl. B) | 19486     |
| `computeMCStats` (impl. B)      | 19506     |
| KPI aggregates (impl. B)        | 19522-19527 |
| `ChattersTab` component (impl. A) | 19808   |
| `chatterStats` useMemo (impl. A) | 19992    |
| `commDue` calcul (impl. A)      | 20002-20007 |
| KPI aggregates (impl. A)        | 20036-20041 |
| `mcStats` useMemo (impl. A)     | 20042-20052 |
| KPI display                      | 20120-20152 |
| MC cards display                 | 20172-20216 |
| Chatter cards display            | 20226-20270 |
| P&L fee helpers                  | 20786-20791 |
