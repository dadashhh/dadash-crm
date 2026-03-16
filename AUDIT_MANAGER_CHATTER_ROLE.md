# AUDIT — Ajout rôle "Manager Chatter" dans DADASH CRM

**Date** : 2026-03-16
**Auteur** : JIM (Architecte Technique)
**Objectif** : Analyser l'architecture actuelle et planifier l'ajout du rôle `manager_chatter`

---

## 1. STRUCTURE RÔLES ACTUELLE

### 1.1 Colonne `profiles.role`

| Propriété | Valeur |
|-----------|--------|
| **Type** | `TEXT` (pas enum PostgreSQL) |
| **Contrainte CHECK** | **Aucune** |
| **Valeurs utilisées** | `gerant`, `chatter`, `provider`, `modele`, `admin`, `ceo` |
| **Default** | Aucun default explicite |

> **Impact** : Pas besoin de `ALTER TYPE ... ADD VALUE`. On peut insérer `'manager_chatter'` directement.

### 1.2 Colonnes clés de `profiles`

| Colonne | Type | Usage |
|---------|------|-------|
| `id` | UUID (= `auth.uid()`) | PK, lien auth.users |
| `role` | TEXT | Rôle métier |
| `assigned_models` | JSONB (array UUID) | Modèles assignés au chatter |
| `commission_pct` / `comm_pct` | NUMERIC | Taux commission chatter |
| `is_active` | BOOLEAN | Actif/inactif |
| `name` / `full_name` | TEXT | Nom affichage |
| `email` | TEXT | Email |
| `messaging_permissions` | JSONB | Permissions messagerie (ex: `can_view_all_assigned`) |

### 1.3 Pas de table `model_members`

Contrairement à ce qui est mentionné dans le contexte initial, **il n'existe PAS de table `model_members`** dans les migrations SQL. L'assignation chatter ↔ modèle se fait via **`profiles.assigned_models`** (JSONB array de UUID).

> **Note** : `team_members` est référencée dans le frontend (`index.html:37964`) mais **aucune migration SQL ne la crée**. C'est probablement une vue ou un alias non fonctionnel.

### 1.4 Hiérarchie actuelle

```
gerant / admin / ceo  →  Accès total (scope: global)
      ↓
chatter               →  Restreint (scope: ses assigned_models)
      ↓
provider              →  Restreint (scope: ses propres TX)
      ↓
modele                →  Accès minimal (ses tâches, paiements)
```

**Pas de couche intermédiaire** entre gérant et chatter. Le "Manager Chatter" viendrait ici :

```
gerant / admin / ceo  →  Accès total
      ↓
MANAGER CHATTER       →  Supervision d'équipe (chatters assignés)
      ↓
chatter               →  Restreint (ses assigned_models)
```

---

## 2. POLICIES RLS ACTUELLES

### 2.1 Pattern dominant

Toutes les RLS utilisent le pattern inline :
```sql
(SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
```

La fonction `_get_my_role()` (SECURITY DEFINER) existe mais les migrations récentes s'en éloignent au profit du pattern inline.

### 2.2 Inventaire complet des policies par table

#### Table `profiles`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `profiles_select` | SELECT | `true` (tout le monde) |
| `profiles_update` | UPDATE | `id = auth.uid() OR role = 'gerant'` |

#### Table `spenders`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `spenders_all_gerant` | ALL | `role = 'gerant'` |
| `spenders_update_chatter` | UPDATE | `role = 'chatter'` |
| `spenders_select_all` | SELECT | `true` |

#### Table `transactions`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `transactions_all_gerant` | ALL | `role = 'gerant'` |
| `transactions_select_chatter` | SELECT | `role = 'chatter'` |
| `transactions_insert_chatter` | INSERT | `role = 'chatter'` |
| `transactions_select_provider` | SELECT | `role = 'provider'` |

#### Table `tg_conversations`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `tg_conv_gerant_all` | ALL | `role = 'gerant'` |
| `tg_conv_chatter_select` | SELECT | `role = 'chatter' AND (assigned_chatter_id = uid OR model_id IN assigned_models)` |

#### Table `tg_messages`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `tg_msg_gerant_all` | ALL | `role = 'gerant'` |
| `tg_msg_chatter_select` | SELECT | `role = 'chatter' AND conversation_id IN (visible conversations)` |

#### Table `audit_logs`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `audit_gerant_all` | ALL | `role = 'gerant'` |
| `audit_chatter_select` | SELECT | `role = 'chatter' AND target_type = 'tg_conversation' AND target_id IN (...)` |

#### Table `notifications`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `notifications_select` | SELECT | `user_id = auth.uid()` |
| `notifications_insert` | INSERT | `true` |
| `notifications_update` | UPDATE | `user_id = auth.uid()` |

#### Table `paiements_internes`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `pi_gerant_all` | ALL | `role IN ('gerant', 'admin', 'ceo')` |
| `pi_destinataire_select` | SELECT | `destinataire_id = auth.uid()` |
| `pi_provider_select` | SELECT | `createur_id = uid AND createur_role = 'provider'` |
| `pi_provider_insert` | INSERT | `role = 'provider' AND destinataire_type = 'gerant'` |
| `pi_destinataire_contest` | UPDATE | `destinataire_id = auth.uid()` |

#### Table `user_permissions`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `user_permissions_select_own` | SELECT | `auth.uid() = user_id` |
| `gerant_manage_permissions` | ALL | `role = 'gerant'` |

#### Tables financières (`expenses`, `payouts`, `model_payments`)
| Policy pattern | CMD | Condition |
|--------|-----|-----------|
| `*_all_gerant` | ALL | `role = 'gerant'` |
| `*_select` | SELECT | `user_id = auth.uid()` ou `role = 'gerant'` |

#### Tables média/scripts/broadcast
| Policy pattern | CMD | Condition |
|--------|-----|-----------|
| Gérant uniquement | ALL | `role IN ('gerant', 'admin', 'ceo')` |

#### Table `spender_events`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `spender_events_read_app` | SELECT | `role IN ('gerant', 'chatter')` |

#### Table `spender_enrich_queue`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `enrich_queue_read_gerant` | SELECT | `role = 'gerant'` |

#### Table `payment_events`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `pe_all_gerant` | ALL | `_get_my_role() IN ('gerant','admin','ceo')` |
| `pe_select_involved` | SELECT | `from_user_id = uid OR to_user_id = uid OR created_by = uid` |
| `pe_actor_update` | UPDATE | `to_user_id = uid OR from_user_id = uid OR created_by = uid` |

#### Table `ledger_entries`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `le_all_gerant` | ALL | `_get_my_role() IN ('gerant','admin','ceo')` |
| `le_select_own` | SELECT | `owner_user_id = auth.uid()` |

#### Table `bot_sessions`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `bot_sessions_gerant` | ALL | `role = 'gerant'` |

#### Table `media_library`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `media_lib_gerant_all` | ALL | `role IN ('gerant', 'admin', 'ceo')` |

#### Table `broadcast_history`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `broadcast_history_gerant_all` | ALL | `role IN ('gerant', 'admin', 'ceo')` |

#### Table `push_campaigns` / `push_recipients`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `push_campaigns_gerant` | ALL | `role = 'gerant'` |
| `push_campaigns_model_read` | SELECT | `model_id = uid OR created_by = uid` |
| `push_campaigns_model_insert` | INSERT | `created_by = uid` |
| `push_recipients_gerant` | ALL | `role = 'gerant'` |

#### Table `scripts`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `scripts_all_gerant` | ALL | `role = 'gerant'` |
| `scripts_select_chatter` | SELECT | `role = 'chatter' AND model_id IN assigned_models` |

#### Table `chatter_restrictions`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `chatter_restrictions_all_gerant` | ALL | `role = 'gerant'` |
| `chatter_restrictions_select_chatter` | SELECT | `chatter_id = auth.uid()` |

#### Table `content_list`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `content_list_gerant` | ALL | `role = 'gerant'` |
| `content_list_model_read` | SELECT | `model_id = auth.uid()` |

#### Table `provider_payouts`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `pp_gerant` | ALL | `role = 'gerant'` |
| `pp_provider_read` | SELECT | `declared_by = auth.uid()` |
| `pp_provider_insert` | INSERT | `declared_by = auth.uid()` |

#### Table `platform_accounts` / `platform_fans` / `sync_jobs`
| Policy | CMD | Condition |
|--------|-----|-----------|
| `gerant_*` | ALL (CRUD) | `is_gerant()` helper function |

### 2.3 Fonctions SECURITY DEFINER

| Fonction | Rôle | Usage |
|----------|------|-------|
| `_get_my_role()` | Retourne le rôle TEXT | Utilisée par payment_events, paiements_internes |
| `is_gerant()` | Retourne BOOLEAN | Utilisée par platform_accounts RLS |
| `rpc_create_payment_event()` | Crée un paiement | Vérifie role IN (gerant, admin, ceo, provider) |
| `rpc_confirm_payment_event()` | Confirme réception | Vérifie to_user_id OU gerant |
| `rpc_reject_payment_event()` | Refuse paiement | Vérifie to_user_id OU gerant |
| `rpc_cancel_payment_event()` | Annule paiement | Vérifie created_by OU gerant |
| `rpc_spenders_soft_delete()` | Soft delete spender | Vérifie gerant/admin/ceo |
| `rpc_spenders_hard_delete()` | Hard delete spender | Vérifie gerant/admin/ceo |
| `safe_delete_spender()` | Unified delete | Vérifie gerant/admin/ceo |
| `fn_pe_on_insert()` | Trigger INSERT payment | Crée notification |
| `fn_pe_on_status_change()` | Trigger UPDATE payment | Ledger + notifications |
| `fn_get_activity_feed()` | RPC feed activité | SECURITY DEFINER bypass RLS |
| `fn_insert_spender_event()` | RPC event spender | SECURITY DEFINER bypass RLS |
| `rpc_notifications_counts()` | Compteurs notifs | Filtré par auth.uid() |
| `rpc_mark_notifications_read()` | Marquer lu | Filtré par auth.uid() |

> **Total** : ~50+ policies RLS sur 20+ tables, ~32 fonctions SECURITY DEFINER, 2 helpers (`_get_my_role`, `is_gerant`).

### 2.4 Attention : `messaging_permissions`

Les policies RLS de `tg_conversations` et `tg_messages` utilisent aussi `profiles.messaging_permissions->>'can_view_all_assigned'` pour affiner l'accès chatter. Le Manager Chatter devra avoir sa propre logique distincte (pas basée sur `messaging_permissions`).

---

## 3. SYSTÈME user_permissions EXISTANT

### 3.1 Table `user_permissions`

```sql
CREATE TABLE user_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  can_view   BOOLEAN DEFAULT false,
  can_edit   BOOLEAN DEFAULT false,
  UNIQUE(user_id, feature)
);
```

### 3.2 Features disponibles

```
dashboard, business, equipe, messagerie, compta, automation,
bots, admin, transactions, spenders, modeles, export, logs
```

### 3.3 DEFAULT_ROLE_PERMISSIONS (frontend)

```javascript
const DEFAULT_ROLE_PERMISSIONS = {
  gerant:  { /* tout = "edit" */ },
  chatter: { dashboard:"view", messagerie:"edit", transactions:"edit", spenders:"view", /* reste = "none" */ },
  modele:  { modeles:"view", /* reste = "none" */ },
  provider:{ compta:"view", transactions:"view", /* reste = "none" */ },
};
```

### 3.4 Résolution des permissions (3 niveaux)

```
1. user_permissions (par employé) → le plus prioritaire
2. DEFAULT_ROLE_PERMISSIONS[role] → fallback par rôle
3. ROLE_ACCESS[role] → dernier fallback (tabs visibles)
```

> **Point clé** : Ce système permet déjà de donner des permissions individuelles à chaque employé. Le rôle `manager_chatter` pourrait s'appuyer dessus.

---

## 4. FRONTEND — Contrôle d'accès

### 4.1 ROLE_ACCESS (tabs par rôle)

```javascript
const ROLE_ACCESS = {
  gerant:  ["dashboard","business","equipe","messagerie","compta","bots","scripts","admin"],
  admin:   ["admin"],
  ceo:     ["admin"],
  modele:  ["model_checklist","model_content","model_tasks","model_payments","model_compta","model_notif"],
  chatter: ["chatter_dashboard","chatter_transactions","chatter_spenders","chatter_messagerie",
            "chatter_compta","chatter_competition","chatter_scan","chatter_notif"],
  provider:["provider_dashboard","transactions","provider_compta","provider_notif"]
};
```

### 4.2 getScope (isolation des données)

```javascript
const getScope = (user) => {
  if (['gerant', 'ceo', 'admin'].includes(user.role)) return { type: 'global' };
  if (user.role === 'chatter') return { type: 'chatter', chatter_user_id: user.id };
  if (user.role === 'provider') return { type: 'provider', provider_user_id: user.id };
  return { type: 'global' };
};
```

### 4.3 Guards critiques

```javascript
const isAdminUser = (user) => ["admin","gerant","ceo"].includes(user.role);
const isChatterUser = (u) => u.role === "chatter";
```

### 4.4 UI Admin — Dropdown rôles

```html
<option value="gerant">Gérant</option>
<option value="chatter">Chatter</option>
<option value="modele">Modèle</option>
<option value="provider">Provider</option>
```

> **Pas de `manager_chatter`** dans le dropdown actuellement.

---

## 5. POINTS D'IMPACT (tous les fichiers à modifier)

### 5.1 Backend (SQL/Supabase)

| Fichier/Table | Ce qui change |
|---------------|--------------|
| `profiles` | ADD COLUMN `manager_id`, insérer `role = 'manager_chatter'` |
| **20+ tables avec RLS** | Ajouter policies SELECT pour `manager_chatter` |
| `_get_my_role()` / `is_gerant()` | Aucun changement (retournent TEXT/BOOLEAN) |
| `rpc_create_payment_event()` | Ajouter `manager_chatter` si le manager peut créer des paiements |
| `rpc_*_payment_event()` | Évaluer si le manager peut confirmer/rejeter |
| `user_permissions` | Ajouter DEFAULT_ROLE_PERMISSIONS côté frontend |
| **Fonctions SECURITY DEFINER** | ~6 RPCs avec checks de rôle à évaluer |

### 5.2 Frontend (`index.html`)

| Section | Ligne(s) | Ce qui change |
|---------|----------|--------------|
| `ROLE_ACCESS` | 7610 | Ajouter `manager_chatter: [...]` |
| `DEFAULT_ROLE_PERMISSIONS` | 26713 | Ajouter `manager_chatter: {...}` |
| `DEFAULT_TAB` | 7655 | Ajouter `manager_chatter: "..."` |
| `getScope` | 7725-7731 | Ajouter cas `manager_chatter` |
| `isAdminUser` | 7657 | Éventuellement ajouter `manager_chatter` |
| `RBAC_SECTION_ACCESS` | 7735 | Ajouter `manager_chatter` |
| `canSeeSection` | 7748 | Fonctionne déjà (lookup RBAC_SECTION_ACCESS) |
| `displayFees` | 9045 | Ajouter cas `manager_chatter` |
| `AdminUsersTab` dropdown | 26678 | Ajouter `<option value="manager_chatter">` |
| `FilterBar` | 10050+ | Conditionnel `role === "gerant"` → ajouter `manager_chatter` |
| Notifications (gérant) | 9893, 9939, etc. | Éventuellement notifier aussi les managers |

---

## 6. RECOMMANDATION STRUCTURE ÉQUIPE

### Option recommandée : **Option C — Colonne `manager_id` dans `profiles`**

**Pourquoi** :
- ✅ Pas de nouvelle table à créer
- ✅ Cohérent avec l'architecture existante (tout dans `profiles`)
- ✅ Simple : `profiles.manager_id UUID REFERENCES profiles(id)`
- ✅ RLS simple : `WHERE manager_id = auth.uid()`
- ✅ Un chatter = un manager (relation 1:N claire)

**Contre** :
- ❌ Un chatter ne peut avoir qu'un seul manager (suffisant pour ce use case)

### Migration SQL

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_manager_id ON profiles(manager_id);
```

### Logique manager

```
Manager voit :
  - Chatters WHERE manager_id = auth.uid()
  - Conversations de CES chatters (assigned_models de ces chatters)
  - Transactions de CES chatters
  - Stats de CES chatters
```

---

## 7. PLAN D'IMPLÉMENTATION DÉTAILLÉ

### PHASE 1 — Schema SQL (Migration)

```sql
-- ═══════════════════════════════════════════════════════
-- MIGRATION: Ajout rôle manager_chatter + structure équipe
-- Date: 2026-03-XX
-- ═══════════════════════════════════════════════════════

-- 1. Colonne manager_id (lien chatter → manager)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_manager_id ON profiles(manager_id);

-- 2. Helper: récupérer les IDs des chatters managés
CREATE OR REPLACE FUNCTION public._get_managed_chatter_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles
  WHERE manager_id = auth.uid()
    AND role = 'chatter'
$$;

GRANT EXECUTE ON FUNCTION public._get_managed_chatter_ids() TO authenticated;

-- 3. Helper: récupérer les assigned_models des chatters managés
CREATE OR REPLACE FUNCTION public._get_managed_model_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT (elem)::uuid
  FROM profiles p,
       jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
  WHERE p.manager_id = auth.uid()
    AND p.role = 'chatter'
$$;

GRANT EXECUTE ON FUNCTION public._get_managed_model_ids() TO authenticated;
```

### PHASE 2 — Policies RLS pour `manager_chatter`

```sql
-- ═══ SPENDERS ═══
CREATE POLICY spenders_select_manager ON spenders FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
);
-- Note: manager voit tous les spenders (comme chatter) — filtrage côté frontend par modèle

-- ═══ TRANSACTIONS ═══
CREATE POLICY transactions_select_manager ON transactions FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND (
    chatter_id IN (SELECT public._get_managed_chatter_ids())
    OR model_id IN (SELECT public._get_managed_model_ids())
  )
);

-- ═══ TG_CONVERSATIONS ═══
CREATE POLICY tg_conv_manager_select ON tg_conversations FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND (
    assigned_chatter_id IN (SELECT public._get_managed_chatter_ids())
    OR model_id IN (SELECT public._get_managed_model_ids())
  )
);

-- ═══ TG_MESSAGES ═══
CREATE POLICY tg_msg_manager_select ON tg_messages FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND conversation_id IN (
    SELECT c.id FROM tg_conversations c
    WHERE c.assigned_chatter_id IN (SELECT public._get_managed_chatter_ids())
       OR c.model_id IN (SELECT public._get_managed_model_ids())
  )
);

-- ═══ PROFILES ═══
-- profiles_select est déjà USING(true) → OK
-- profiles_update : manager peut modifier ses chatters
CREATE POLICY profiles_update_manager ON profiles FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND id IN (SELECT public._get_managed_chatter_ids())
);

-- ═══ USER_PERMISSIONS ═══
-- Manager peut voir les permissions de ses chatters
CREATE POLICY user_permissions_select_manager ON user_permissions FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND user_id IN (SELECT public._get_managed_chatter_ids())
);

-- ═══ NOTIFICATIONS ═══
-- notifications_select est déjà user_id = auth.uid() → OK (le manager voit ses propres notifs)

-- ═══ AUDIT_LOGS ═══
CREATE POLICY audit_manager_select ON audit_logs FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
  AND target_type = 'tg_conversation'
  AND target_id IN (
    SELECT c.id FROM tg_conversations c
    WHERE c.assigned_chatter_id IN (SELECT public._get_managed_chatter_ids())
       OR c.model_id IN (SELECT public._get_managed_model_ids())
  )
);
```

### PHASE 3 — Frontend (`index.html`)

#### 3.1 ROLE_ACCESS
```javascript
const ROLE_ACCESS = {
  gerant: ["dashboard","business","equipe","messagerie","compta","bots","scripts","admin"],
  manager_chatter: ["manager_dashboard","manager_equipe","manager_conversations","manager_stats","manager_notif"],
  admin: ["admin"],
  ceo: ["admin"],
  // ... reste inchangé
};
```

#### 3.2 DEFAULT_ROLE_PERMISSIONS
```javascript
const DEFAULT_ROLE_PERMISSIONS = {
  // ... existants
  manager_chatter: {
    dashboard:"view", business:"none", equipe:"view", messagerie:"view",
    compta:"none", automation:"none", bots:"none", admin:"none",
    transactions:"view", spenders:"view", modeles:"none", export:"none", logs:"none"
  },
};
```

#### 3.3 getScope
```javascript
const getScope = (user) => {
  if (!user) return { type: 'global' };
  if (['gerant', 'ceo', 'admin'].includes(user.role)) return { type: 'global' };
  if (user.role === 'manager_chatter') return { type: 'manager', manager_user_id: user.id };
  if (user.role === 'chatter') return { type: 'chatter', chatter_user_id: user.id, email: user.email };
  if (user.role === 'provider') return { type: 'provider', provider_user_id: user.id, email: user.email };
  return { type: 'global' };
};
```

#### 3.4 DEFAULT_TAB + dropdown
```javascript
const DEFAULT_TAB = { ..., manager_chatter: "manager_dashboard" };

// AdminUsersTab dropdown:
<option value="manager_chatter">Manager Chatter</option>
```

---

## 8. RISQUES ET MITIGATIONS

| # | Risque | Gravité | Mitigation |
|---|--------|---------|------------|
| 1 | **Performance RLS** — les fonctions `_get_managed_*` font des sous-requêtes | Moyenne | Utiliser SECURITY DEFINER + index sur `manager_id`. Tester avec EXPLAIN ANALYZE. |
| 2 | **Récursion RLS** — `profiles` référence lui-même dans les policies | Haute | Utiliser SECURITY DEFINER pour bypasser RLS dans les helpers. Déjà le pattern de `_get_my_role()`. |
| 3 | **Migration chatters existants** — qui assigner à quel manager ? | Moyenne | Migration manuelle. Gérant assigne via UI. Chatters sans manager = pas de manager (NULL). |
| 4 | **Policies manquantes** — tables non couvertes | Moyenne | Audit exhaustif ci-dessus. Vérifier avec `pg_policies` après migration. |
| 5 | **Frontend massif** (index.html = 60K+ lignes) — risque régressions | Haute | Tester chaque rôle manuellement. Chercher tous les `=== "gerant"`, `=== "chatter"` pour s'assurer que manager_chatter est couvert. |
| 6 | **`team_members`** référencée sans migration | Faible | Probablement dead code. Ne pas toucher. Vérifier si la page "Gestion" fonctionne en prod. |

---

## 9. QUESTIONS CRITIQUES POUR DADA

### Permissions exactes

1. **Le Manager Chatter peut-il créer des transactions ?** (actuellement seul chatter + gérant peuvent)
2. **Le Manager Chatter peut-il assigner/réassigner des chatters à des modèles ?**
3. **Le Manager Chatter peut-il voir la comptabilité (compta) de son équipe ?** (soldes, paiements)
4. **Le Manager Chatter peut-il accéder à la messagerie Telegram ?** (lecture seule ? écriture ?)
5. **Le Manager Chatter peut-il valider/refuser des transactions ?**

### Structure équipe

6. **Un chatter peut-il avoir plusieurs managers ?** (si oui → table N:N au lieu de `manager_id`)
7. **Un manager peut-il manager d'autres managers ?** (hiérarchie multi-niveaux ?)
8. **Le manager hérite-t-il des `assigned_models` de ses chatters ou a-t-il les siens propres ?**

### UI attendue

9. **Pages spécifiques Manager** : Dashboard équipe ? Stats comparatives ? Classement chatters ?
10. **Le Manager accède-t-il à la page Admin ?** (gestion users, permissions)
11. **Faut-il une page "Mon équipe" pour le manager ?**

### Migration

12. **Combien de chatters en production ?** (pour estimer l'effort de migration)
13. **Qui assigne les chatters aux managers ?** (le gérant ? le manager lui-même ?)

---

## 10. PROMPTS PRODUCTION-READY

### PROMPT 1 — SQL Migration + RLS

> **Modèle** : Claude Opus 4
> **Coût estimé** : ~$0.50-1.00
> **Durée** : 5-10 min

```
Tu es DBA PostgreSQL expert Supabase.
Contexte: DADASH CRM, Supabase PostgreSQL avec RLS.

ÉTAT ACTUEL:
- profiles.role est TEXT, valeurs: gerant, chatter, provider, modele, admin, ceo
- Pas de contrainte CHECK sur role
- Assignation chatter↔modèle via profiles.assigned_models (JSONB array UUID)
- RLS pattern: (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
- Fonction _get_my_role() SECURITY DEFINER existe

OBJECTIF:
Créer une migration SQL complète pour ajouter le rôle manager_chatter.

SPÉCIFICATIONS:
1. ALTER TABLE profiles ADD COLUMN manager_id UUID REFERENCES profiles(id)
2. Créer _get_managed_chatter_ids() et _get_managed_model_ids() SECURITY DEFINER
3. Ajouter policies RLS sur TOUTES ces tables:
   - spenders (SELECT pour manager)
   - transactions (SELECT filtré par chatters managés)
   - tg_conversations (SELECT filtré par chatters managés)
   - tg_messages (SELECT via conversations visibles)
   - profiles (UPDATE sur chatters managés)
   - audit_logs (SELECT sur conversations managées)
   - user_permissions (SELECT sur chatters managés)
   - content_tasks, weekly_rankings, challenges (SELECT)
   - expenses, payouts (aucun accès manager)

4. NE PAS toucher aux policies existantes
5. Idempotent (DROP IF EXISTS avant CREATE)
6. Index sur manager_id
7. Commentaires en français

FORMAT: Un seul fichier .sql prêt à exécuter.
```

### PROMPT 2 — Frontend (index.html)

> **Modèle** : Claude Opus 4
> **Coût estimé** : ~$1.00-2.00
> **Durée** : 15-30 min

```
Tu es développeur React expert.
Contexte: DADASH CRM, app React monolithique dans index.html (~60K lignes).

ÉTAT ACTUEL:
- ROLE_ACCESS (ligne 7610): définit les tabs par rôle
- DEFAULT_ROLE_PERMISSIONS (ligne 26713): permissions par défaut par rôle
- getScope (ligne 7725): isolation des données
- isAdminUser (ligne 7657): guard admin
- DEFAULT_TAB (ligne 7655): tab par défaut
- RBAC_SECTION_ACCESS (ligne 7735): sections par rôle
- AdminUsersTab (ligne 26555): gestion utilisateurs avec dropdown rôle
- displayFees (ligne 9045): affichage frais par rôle

OBJECTIF:
Ajouter le rôle manager_chatter au frontend.

SPÉCIFICATIONS:
1. ROLE_ACCESS: ajouter manager_chatter avec tabs spécifiques
2. DEFAULT_ROLE_PERMISSIONS: manager voit dashboard, équipe, messagerie, transactions, spenders (view)
3. DEFAULT_TAB: manager_chatter → "manager_dashboard"
4. getScope: retourner { type: 'manager', manager_user_id: user.id }
5. RBAC_SECTION_ACCESS: ajouter manager_chatter
6. AdminUsersTab dropdown: ajouter option "Manager Chatter"
7. displayFees: manager voit comme chatter (fees agrégées)
8. Créer composant ManagerDashboard minimal (liste chatters, stats équipe)
9. assertChatterScope: ajouter cas 'manager' (voit données de ses chatters)

CONTRAINTES:
- NE PAS refactorer le code existant
- Ajouter, pas modifier les structures existantes
- Garder le même style CSS
- Supporté multilingue (fr/en au minimum)
```

---

## 11. RÉSUMÉ EXÉCUTIF

| Item | Status |
|------|--------|
| Type colonne `role` | TEXT (pas enum) — ✅ simple à étendre |
| Contrainte CHECK | Aucune — ✅ pas de blocage |
| Tables avec RLS | **20+ tables, ~50+ policies** — chaque table à évaluer |
| Fonctions SECURITY DEFINER | **~32 fonctions** — ~6 RPCs avec checks de rôle à modifier |
| `model_members` | N'existe pas — `profiles.assigned_models` (JSONB) |
| Système permissions | `user_permissions` + `DEFAULT_ROLE_PERMISSIONS` — ✅ déjà granulaire |
| Structure équipe recommandée | **Option C** — `profiles.manager_id` |
| Complexité estimée | **Haute** — ~15 policies SQL + ~6 RPCs + ~20 points frontend |
| Risque principal | Performance RLS (sous-requêtes imbriquées) + récursion profiles |
| Prérequis | Réponses de DADA aux 13 questions |
