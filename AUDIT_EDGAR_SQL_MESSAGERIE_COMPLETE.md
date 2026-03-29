# AUDIT EDGAR-SQL — Schéma Complet Messagerie DB

**Agent** : EDGAR-SQL
**Date** : 2026-03-29
**Projet** : lkrzjwfwhiimpnsyeuxi
**Méthode** : Analyse statique de TOUTES les migrations SQL versionnées
**Scope** : Audit général messagerie — schéma, RLS, assignation, impact migration, manager chatter

---

## 1. SCHÉMA COMPLET MESSAGERIE

### 1.1 `tg_conversations`

**Source** : `supabase/migrations/20260225_tg_conversations_messages_audit.sql` + compat layers

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `tg_chat_id` | text | NOT NULL | — | **UNIQUE** (seul — bug structurel) |
| `spender_id` | uuid | NULL | — | Peuplé par pipeline autofill |
| `model_id` | uuid | NULL | — | **Jamais peuplé** par le pipeline |
| `assigned_chatter_id` | uuid | NULL | — | Assignation manuelle via CRM |
| `status` | text | NOT NULL | `'open'` | — |
| `last_message_at` | timestamptz | NULL | — | Mis à jour par RPC upsert |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `tg_user_id` | bigint→text | NULL | — | Type changé en TEXT (20260313) |
| `tg_peer_id` | text | NULL | — | Compat layer |
| `tg_username` | text | NULL | — | Compat layer |
| `username` | text | NULL | — | Peuplé par RPC (20260331) |
| `display_name` | text | NULL | — | Peuplé par RPC (20260331) |
| `tg_first_name` | text | NULL | — | Compat layer |
| `tg_last_name` | text | NULL | — | Compat layer |
| `tg_display_name` | text | NULL | — | Compat layer |
| `name` | text | NULL | — | Compat layer |

**Contraintes** :
- `PRIMARY KEY (id)`
- `UNIQUE (tg_chat_id)` — **c'est le bug : empêche multi-modèle**
- Pas de FK formelle sur `spender_id`, `model_id`, `assigned_chatter_id`

**Index** (7) :

| Index | Colonnes | Partiel |
|-------|----------|---------|
| PK | `id` | — |
| UNIQUE | `tg_chat_id` | — |
| `idx_tg_conversations_spender_id` | `spender_id` | WHERE NOT NULL |
| `idx_tg_conversations_model_id` | `model_id` | WHERE NOT NULL |
| `idx_tg_conversations_assigned_chatter_id` | `assigned_chatter_id` | WHERE NOT NULL |
| `idx_tg_conversations_status` | `status` | — |
| `idx_tg_conversations_last_message_at` | `last_message_at DESC NULLS LAST` | — |
| `idx_tg_conversations_created_at` | `created_at DESC` | — |
| `idx_tg_conversations_tg_user_id` | `tg_user_id` | WHERE NOT NULL |

**RLS** : ENABLED — 2 policies actives

| Policy | Rôle | Opération | Filtre |
|--------|------|-----------|--------|
| `tg_conv_gerant_all` | gerant | ALL | `role = 'gerant'` — full access |
| `tg_conv_chatter_select` | chatter | SELECT | `assigned_chatter_id = uid` OU (`can_view_all_assigned = true` ET `model_id IN assigned_models`) |

**Trigger** :
- `trg_sync_conv_from_message` — AFTER INSERT sur `tg_messages` → met à jour tg_user_id, username, display_name depuis `meta` du message

---

### 1.2 `tg_messages`

**Source** : `supabase/migrations/20260225_tg_conversations_messages_audit.sql` + fix 20260327

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY |
| `conversation_id` | uuid | NOT NULL | — | FK → `tg_conversations(id)` ON DELETE CASCADE |
| `direction` | text | NOT NULL | — | CHECK: `'in'` ou `'out'` |
| `text` | text | NULL | — | Contenu du message |
| `tg_message_id` | text | NOT NULL | — | Rendu NOT NULL (20260327), backfill `'legacy_' \|\| id` |
| `sender_profile_id` | uuid | NULL | — | Qui a envoyé |
| `created_at` | timestamptz | NOT NULL | `now()` | — |
| `meta` | jsonb | NOT NULL | `'{}'` | Contient: tg_user_id, username, display_name, media_type, media_url |

**Contraintes** :
- `PRIMARY KEY (id)`
- `FOREIGN KEY (conversation_id)` → `tg_conversations(id)` ON DELETE CASCADE
- `CHECK (direction IN ('in', 'out'))`
- `UNIQUE (conversation_id, tg_message_id)` — constraint `uq_tg_messages_conv_tg_msg` (20260327)

**`model_id` : ABSENT** — pas de colonne model_id sur tg_messages.

**Index** (5) :

| Index | Colonnes |
|-------|----------|
| `idx_tg_messages_conversation_id` | `conversation_id` |
| `idx_tg_messages_conversation_created` | `(conversation_id, created_at ASC)` |
| `idx_tg_messages_direction` | `direction` |
| `idx_tg_messages_tg_message_id_nonpartial` | `tg_message_id` |
| `idx_tg_messages_created_at` | `created_at DESC` |

**RLS** : ENABLED — 2 policies actives

| Policy | Rôle | Opération | Filtre |
|--------|------|-----------|--------|
| `tg_msg_gerant_all` | gerant | ALL | `role = 'gerant'` — full access |
| `tg_msg_chatter_select` | chatter | SELECT | `conversation_id IN (conversations visibles)` — même logique que tg_conversations |

---

### 1.3 `audit_logs`

| Colonne | Type | Nullable | Default |
|---------|------|----------|---------|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `actor_id` | uuid | NULL | — |
| `action` | text | NOT NULL | — |
| `target_type` | text | NULL | — |
| `target_id` | uuid | NULL | — |
| `meta` | jsonb | NOT NULL | `'{}'` |
| `created_at` | timestamptz | NOT NULL | `now()` |

**RLS** : ENABLED — filtrage identique (gerant=all, chatter=SELECT convs autorisées)

---

### 1.4 `spenders` (table liée)

**Source** : `supabase/migrations/20260226_spender_pipeline_001_spenders.sql` + 20260228

| Colonne | Type | Nullable | Notes |
|---------|------|----------|-------|
| `id` | uuid | NOT NULL | PK |
| `tg_user_id` | bigint→text | NULL | UNIQUE WHERE NOT NULL |
| `handle` | text | NULL | @username ou tg_<id> |
| `display_name` | text | NULL | — |
| `model_id` | uuid | NULL | FK → `models(id)` ON DELETE SET NULL (ajouté 20260228) |
| `meta` | jsonb | NOT NULL | `'{}'` |
| `last_seen_at` | timestamptz | NULL | — |
| `updated_at` | timestamptz | NULL | Trigger auto-update |
| `created_at` | timestamptz | NOT NULL | `now()` |

**RLS** : gerant+chatter=SELECT, gerant=ALL, écriture=service_role uniquement

---

### 1.5 Tables `conversations` / `messages` (sans préfixe tg_)

**RÉSULTAT** : **N'EXISTENT PAS** dans les migrations versionnées. Seules les tables `tg_conversations` et `tg_messages` existent. Le frontend et Carlos API peuvent utiliser des noms sans préfixe, mais ils pointent vers les mêmes tables `tg_*`.

---

### 1.6 `profiles` (colonnes pertinentes messagerie)

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid | PK, = `auth.uid()` |
| `role` | text | `'gerant'`, `'chatter'`, `'provider'`, `'modele'` |
| `assigned_models` | jsonb (array UUID) | Source de vérité pour assignation chatter → modèles |
| `messaging_permissions` | jsonb | `{can_send, can_close, can_assign, can_view_all_assigned}` |
| `manager_commission_pct` | numeric(5,2) | Default 3.00 (20260317) |
| `manager_balance` | numeric(12,2) | Default 0.00 (20260317) |

---

## 2. RLS — FILTRAGE PAR RÔLE

### Réponses binaires

| Question | Réponse | Détail |
|----------|---------|--------|
| Les policies supportent gérant vs chatter ? | **OUI** | 2 policies séparées par table |
| Un chatter ne voit que ses convs assignées ? | **OUI** | Via `assigned_chatter_id = uid` OU `model_id IN assigned_models` (si `can_view_all_assigned = true`) |
| Un gérant voit tout ? | **OUI** | Policy `FOR ALL USING (role = 'gerant')` |
| `model_id = NULL` rend-il des convs invisibles ? | **OUI — BUG CRITIQUE** | Si `assigned_chatter_id` n'est pas rempli ET `model_id IS NULL`, la conv est invisible au chatter. `NULL IN (...)` = false en SQL. |
| Y a-t-il des trous dans le RLS ? | **OUI — 3 trous** | Voir détail ci-dessous |

### Trous RLS identifiés

**Trou 1** — `model_id NULL` = conv invisible au chatter
- La plupart des convs ont `model_id = NULL` (jamais peuplé par le pipeline)
- Le chatter ne les voit que si `assigned_chatter_id` est rempli manuellement
- **Impact** : convs sans assignation manuelle = trou noir pour les chatters

**Trou 2** — Pas de policy INSERT/UPDATE pour chatters sur `tg_conversations`
- Un chatter ne peut pas mettre à jour le statut, assigner un autre chatter, etc.
- Seul le gérant peut modifier via RLS
- **Impact** : fonctionnalités CRM de gestion de conv limitées au gérant

**Trou 3** — RLS `manager_chatters`, `chatter_shifts`, `manager_commissions` = `USING (true)`
- **Tout utilisateur authentifié** peut lire/écrire ces tables
- Un chatter peut voir les assignations et commissions de tous les managers
- **Impact** : fuite de données entre rôles

---

## 3. ASSIGNATION CHATTER → MODÈLE

### Structure actuelle

| Aspect | Détail |
|--------|--------|
| **Table source** | `profiles.assigned_models` (jsonb array de UUID) |
| **Vue dénormalisée** | `v_chatter_models` — explose le array en lignes (chatter_user_id, model_id) |
| **Utilisée dans RLS** | **OUI** — `model_id IN (SELECT elem FROM jsonb_array_elements_text(assigned_models))` |
| **Multi-modèles** | **OUI** — un chatter peut avoir `["uuid1", "uuid2", "uuid3"]` dans `assigned_models` |
| **Table hiérarchique** | `manager_chatters` (manager_id → chatter_id), mais **pas utilisée dans les RLS messagerie** |

### Vue `v_chatter_models`

```sql
SELECT p.id AS chatter_user_id, m.value AS model_id
FROM profiles p, unnest(p.assigned_models) AS m(value)
WHERE p.role = 'chatter' AND p.is_active IS NOT FALSE
  AND p.assigned_models IS NOT NULL AND array_length(p.assigned_models, 1) > 0;
```

Gère automatiquement `text[]` et `jsonb` via recréation dynamique (migration 20260227_fix_v_chatter_models.sql).

---

## 4. IMPACT MIGRATION OPTION A

### 4.1 Rows avec `model_id = NULL` aujourd'hui

**Réponse estimée : TOUTES ou quasi-toutes les rows ont `model_id = NULL`.**

Justification :
- La RPC `upsert_tg_conversation` ne passe **jamais** `model_id` (ni v1 ni v2)
- `handleMessage.ts` n'envoie **pas** `model_id` à la RPC
- Aucun job background (enrichWorker, upsertSpenderAndEvent) ne set `model_id` sur `tg_conversations`
- Le frontend ne fait aucun `UPDATE tg_conversations SET model_id = ...` (grep confirmé : 0 résultats)
- **Seule exception possible** : assignation manuelle par le gérant dans l'UI (non trouvée dans le code)

→ **Le backfill avant migration est OBLIGATOIRE** et devra déduire `model_id` depuis une source externe (Carlos API, `spenders.model_id`, ou assignation manuelle).

### 4.2 Foreign keys impactées

| FK | Impact |
|----|--------|
| `tg_messages.conversation_id → tg_conversations(id)` | **PAS CASSÉ** — la FK pointe sur `id` (PK), pas sur `tg_chat_id` |
| `spender_id`, `model_id`, `assigned_chatter_id` | **Pas de FK formelles** dans les migrations — ce sont des uuid nus |

**Verdict** : Changer la contrainte UNIQUE de `(tg_chat_id)` à `(tg_chat_id, model_id)` ne casse aucune FK.

### 4.3 RLS policies après migration

| Policy | Tient ? | Raison |
|--------|---------|--------|
| `tg_conv_gerant_all` | **OUI** | Pas de filtre sur tg_chat_id |
| `tg_conv_chatter_select` | **OUI** | Filtre sur `model_id` — fonctionne mieux si `model_id NOT NULL` |
| `tg_msg_gerant_all` | **OUI** | Pas de filtre |
| `tg_msg_chatter_select` | **OUI** | Filtre via `conversation_id IN (...)` — pas affecté |

**Les RLS policies tiennent après migration.** Mieux : elles fonctionneront *mieux* car `model_id` ne sera plus NULL.

### 4.4 Jobs background — écritures dans `tg_conversations`

| Composant | Écrit `tg_conversations` ? | Avec `model_id` ? | Action requise |
|-----------|---------------------------|-------------------|----------------|
| `handleMessage.ts` | OUI (RPC upsert) | **NON** | Doit ajouter `p_model_id` |
| `upsertSpenderAndEvent.ts` | OUI (UPDATE spender_id) | **NON** | Doit passer `model_id` |
| `enrichWorker.ts` | NON | — | Aucune |
| Trigger `trg_sync_conv_from_message` | OUI (UPDATE metadata) | **NON** | Aucune (metadata seulement) |
| Frontend CRM (index.html) | OUI (UPDATE assigned_chatter, status) | **NON** | Doit passer `model_id` dans les lookups |

**Conclusion** : 3 composants doivent être modifiés pour passer `model_id` :
1. RPC `upsert_tg_conversation` — ajouter param `p_model_id`
2. `handleMessage.ts` — le bot doit connaître quel `model_id` est associé au chat
3. Frontend lookups `.eq("tg_chat_id", cid).maybeSingle()` → `.eq("tg_chat_id", cid).eq("model_id", mid)`

---

## 5. TABLES MANQUANTES POUR MANAGER CHATTER

### Ce qui existe déjà (migration 20260317)

| Table | Colonnes clés | Status |
|-------|---------------|--------|
| `manager_chatters` | `manager_id`, `chatter_id`, UNIQUE | **EXISTS** — mais RLS trop permissive |
| `chatter_shifts` | `chatter_id`, `manager_id`, date/time, status | **EXISTS** — mais RLS trop permissive |
| `manager_commissions` | `manager_id`, period, amounts, status | **EXISTS** — mais RLS trop permissive |
| `profiles.manager_commission_pct` | numeric(5,2) | **EXISTS** |
| `profiles.manager_balance` | numeric(12,2) | **EXISTS** |

### Ce qui MANQUE

#### A. Rôle `manager_chatter` dans `profiles.role`

Le CHECK constraint sur `profiles.role` (s'il existe) n'inclut probablement pas `'manager_chatter'`. Les RLS policies ne vérifient que `'gerant'` et `'chatter'`.

**Migration nécessaire** :
```sql
-- Ajouter le rôle si CHECK constraint existe
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_role;
-- ALTER TABLE profiles ADD CONSTRAINT chk_role
--   CHECK (role IN ('gerant', 'chatter', 'provider', 'modele', 'manager_chatter'));
```

#### B. RLS messagerie pour manager_chatter

Aucune policy ne mentionne `manager_chatter`. Le manager doit voir les convs de ses chatters.

**Migration nécessaire** :
```sql
-- Manager voit les convs de ses chatters
CREATE POLICY tg_conv_manager_select ON tg_conversations
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND (
      assigned_chatter_id IN (
        SELECT chatter_id FROM manager_chatters WHERE manager_id = auth.uid()
      )
      OR model_id IN (
        SELECT (elem)::uuid
        FROM profiles p,
        jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id IN (
          SELECT chatter_id FROM manager_chatters WHERE manager_id = auth.uid()
        )
      )
    )
  );

-- Même logique pour tg_messages
CREATE POLICY tg_msg_manager_select ON tg_messages
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND conversation_id IN (
      SELECT id FROM tg_conversations
      WHERE assigned_chatter_id IN (
        SELECT chatter_id FROM manager_chatters WHERE manager_id = auth.uid()
      )
      OR model_id IN (
        SELECT (elem)::uuid
        FROM profiles p,
        jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id IN (
          SELECT chatter_id FROM manager_chatters WHERE manager_id = auth.uid()
        )
      )
    )
  );
```

#### C. Durcissement RLS sur tables manager existantes

```sql
-- Remplacer USING(true) par filtrage par rôle
DROP POLICY IF EXISTS "manager_chatters_all" ON manager_chatters;

CREATE POLICY manager_chatters_gerant ON manager_chatters
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );

CREATE POLICY manager_chatters_manager_select ON manager_chatters
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager_chatter'
    AND manager_id = auth.uid()
  );

-- Même pattern pour chatter_shifts et manager_commissions
```

#### D. Récapitulatif tables manquantes / à modifier

| Composant | Status | Action |
|-----------|--------|--------|
| `manager_chatters` | EXISTS | Durcir RLS |
| `chatter_shifts` | EXISTS | Durcir RLS |
| `manager_commissions` | EXISTS | Durcir RLS |
| `profiles.role = 'manager_chatter'` | **MANQUE** | Ajouter au CHECK si existant |
| RLS tg_conversations pour manager | **MANQUE** | Créer policy |
| RLS tg_messages pour manager | **MANQUE** | Créer policy |
| RLS audit_logs pour manager | **MANQUE** | Créer policy |
| Vue `v_manager_chatters_convs` | **MANQUE** | Optionnelle mais utile |

---

## VERDICT FINAL

### La DB supporte-t-elle aujourd'hui gérant + chatter ?

**PARTIELLEMENT.**

| Aspect | Status | Détail |
|--------|--------|--------|
| Gérant voit tout | **OUI** | RLS `FOR ALL USING (role = 'gerant')` |
| Chatter voit ses convs | **PARTIELLEMENT** | Fonctionne SI `assigned_chatter_id` est rempli. **CASSÉ** si on dépend de `model_id` (toujours NULL) |
| Chatter ne peut pas modifier | **OUI** (by design) | Pas de policy INSERT/UPDATE pour chatter |
| Isolation chatter ↔ chatter | **OUI** | Chaque chatter ne voit que ses convs |
| Manager chatter | **NON** | Rôle et policies inexistants |
| Multi-modèle | **NON** | UNIQUE(tg_chat_id) interdit |
| `model_id` peuplé | **NON** | Pipeline ne le set jamais |

### Priorité des corrections

| # | Correction | Criticité |
|---|-----------|-----------|
| 1 | **Backfill `model_id`** sur `tg_conversations` | P0 — pré-requis pour tout le reste |
| 2 | **Pipeline : passer `model_id`** dans `handleMessage.ts` + RPC | P0 — sinon backfill est annulé |
| 3 | **Migration Option A** : UNIQUE(tg_chat_id, model_id) | P1 — activer multi-modèle |
| 4 | **RLS manager_chatter** | P1 — nouveau rôle |
| 5 | **Durcir RLS** tables manager (USING true → filtrage) | P2 — sécurité |
| 6 | **Ajouter `model_id` sur `tg_messages`** | P2 — traçabilité par message |

---

## CE QUI EST SAIN — NE PAS TOUCHER

1. **Schema `tg_messages`** — contraintes, index, upsert idempotent
2. **RLS gerant** — full access correct sur toutes les tables
3. **RLS chatter SELECT** — logique correcte (le bug est dans les données NULL, pas dans la policy)
4. **Vue `v_chatter_models`** — dénormalisation propre de `assigned_models`
5. **Trigger `trg_sync_conv_from_message`** — enrichissement metadata correct
6. **Pipeline `handleMessage.ts`** → `upsertSpenderAndEvent` → `enrichWorker` — séquencement correct
7. **Backfill username/display_name** (20260331) — correct et prudent
8. **Table `manager_chatters`** — structure correcte (seul le RLS est à durcir)
