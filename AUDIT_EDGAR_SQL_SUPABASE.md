# AUDIT EDGAR-SQL — Validation Schema Supabase `tg_conversations` / `tg_messages`

**Agent** : EDGAR-SQL
**Date** : 2026-03-29
**Projet** : lkrzjwfwhiimpnsyeuxi
**Méthode** : Analyse statique des migrations SQL versionnées (pas d'accès runtime DB)
**Scope** : Réponse aux 5 questions de l'audit Carlos/Alfred

> **Note** : Cet audit est basé sur l'analyse exhaustive des fichiers de migration SQL
> dans `supabase/migrations/` et du code applicatif. Aucune requête n'a été exécutée
> contre la base de production — les conclusions reflètent le schéma **tel que défini
> dans les migrations versionnées**.

---

## QUESTION 1 — Contrainte réelle sur `tg_conversations`

### Réponse : **(a) `tg_chat_id` seul — bug structurel CONFIRMÉ**

**Source** : `supabase/migrations/20260225_tg_conversations_messages_audit.sql` L9

```sql
CREATE TABLE IF NOT EXISTS tg_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_chat_id text UNIQUE NOT NULL,  -- ← UNIQUE sur tg_chat_id SEUL
  ...
  model_id uuid NULL,               -- ← colonne présente mais PAS dans la contrainte
  ...
);
```

**Conséquence directe** :
- La contrainte `UNIQUE (tg_chat_id)` interdit physiquement 2 rows avec le même `tg_chat_id` mais des `model_id` différents.
- L'UPSERT `ON CONFLICT (tg_chat_id)` dans la RPC `upsert_tg_conversation` (L29) confirme : un seul row par `tg_chat_id`.
- **Il est impossible d'avoir des conversations multi-modèles séparées par row** avec ce schéma.

**L'hypothèse de l'audit Carlos (main.py L444-454 `on_conflict="tg_chat_id,model_id"`) est INVALIDE au niveau DB** : même si le code Python tente un upsert composite, la DB rejetterait un INSERT de doublon sur `tg_chat_id` seul avant que le `ON CONFLICT` composite ne puisse s'appliquer (il n'existe pas de contrainte UNIQUE sur `(tg_chat_id, model_id)`).

---

## QUESTION 2 — `model_id` présent et non-nullable ?

### `tg_conversations`

| Colonne | Type | Nullable | Default | Source |
|---------|------|----------|---------|--------|
| `model_id` | `uuid` | **NULL** (nullable) | aucun | L11 migration 20260225 |

**`model_id` est présent mais nullable.** Il n'est PAS rempli par la RPC `upsert_tg_conversation` — ni la version initiale (20260226) ni la version mise à jour (20260331). La colonne reste `NULL` sauf si le code applicatif la patche séparément.

### `tg_messages`

| Colonne | Type | Nullable | Default | Source |
|---------|------|----------|---------|--------|
| `model_id` | — | **ABSENT** | — | Non présent dans CREATE TABLE L29-38 |

**`model_id` n'existe PAS dans `tg_messages`.** Les messages ne portent aucune information de modèle en colonne. L'info peut être déduite via `conversation_id → tg_conversations.model_id`, mais seulement si cette dernière est peuplée.

### Verdict Q2 :
- `tg_conversations.model_id` : **PRÉSENT, NULLABLE, rarement peuplé**
- `tg_messages.model_id` : **ABSENT**

---

## QUESTION 3 — Données réelles : spenders multi-modèles ?

### Réponse : **IMPOSSIBLE structurellement**

La contrainte `UNIQUE (tg_chat_id)` rend physiquement impossible la création de 2 rows dans `tg_conversations` avec le même `tg_chat_id`. La requête :

```sql
SELECT tg_chat_id, COUNT(DISTINCT model_id) ...
GROUP BY tg_chat_id HAVING COUNT(DISTINCT model_id) > 1
```

**retournerait forcément 0 résultats** car il ne peut exister qu'un seul row par `tg_chat_id`. Si un spender parle à 2 modèles, seule la première conversation est créée ; les suivantes font un `UPDATE last_message_at` sur le même row.

**Le bug ne produit pas de "données corrompues" (doublons) — il produit de la perte de données** : le `model_id` du 2e modèle n'est jamais enregistré, et les messages du 2e modèle sont rattachés à la conversation du 1er modèle.

---

## QUESTION 4 — RLS sur `tg_conversations` et `tg_messages`

### Réponse : **RLS filtre par `model_id` — OUI, mais de façon incomplète**

**Source** : `supabase/migrations/20260229_tg_messaging_rls_messaging_permissions.sql`

#### `tg_conversations` — 2 policies actives :

| Policy | Rôle | Commande | Filtre `model_id` |
|--------|------|----------|-------------------|
| `tg_conv_gerant_all` | gerant | ALL | **NON** — full access |
| `tg_conv_chatter_select` | chatter | SELECT | **OUI** — `model_id IN (assigned_models)` conditionnel à `can_view_all_assigned = true` |

#### `tg_messages` — 2 policies actives :

| Policy | Rôle | Commande | Filtre `model_id` |
|--------|------|----------|-------------------|
| `tg_msg_gerant_all` | gerant | ALL | **NON** — full access |
| `tg_msg_chatter_select` | chatter | SELECT | **OUI** — indirect via `conversation_id IN (tg_conversations visibles)` |

#### Analyse sécurité :

1. **Un chatter peut-il voir les convs d'un autre modèle ?**
   - Si `can_view_all_assigned = true` : NON, filtré par `assigned_models`
   - Si `can_view_all_assigned = false` ou absent : uniquement ses conversations assignées (`assigned_chatter_id = uid`)
   - **Mais** : si `tg_conversations.model_id IS NULL` (souvent le cas vu la RPC), la policy `model_id IN (...)` ne matche jamais `NULL` → le chatter ne voit PAS la conversation (sauf si `assigned_chatter_id` est rempli)

2. **Faille potentielle** : Les conversations avec `model_id = NULL` sont invisibles aux chatters qui dépendent du filtre `assigned_models`. Cela force l'assignation manuelle via `assigned_chatter_id`.

---

## QUESTION 5 — Index existants

### Source : `supabase/migrations/20260225_tg_conversations_messages_audit.sql`

#### `tg_conversations` — 7 index :

| Index | Colonnes | Type |
|-------|----------|------|
| PK | `id` | PRIMARY KEY |
| UNIQUE | `tg_chat_id` | UNIQUE (implicite de la contrainte) |
| `idx_tg_conversations_spender_id` | `spender_id` (partiel: WHERE NOT NULL) | B-tree |
| `idx_tg_conversations_model_id` | `model_id` (partiel: WHERE NOT NULL) | B-tree |
| `idx_tg_conversations_assigned_chatter_id` | `assigned_chatter_id` (partiel) | B-tree |
| `idx_tg_conversations_status` | `status` | B-tree |
| `idx_tg_conversations_last_message_at` | `last_message_at DESC NULLS LAST` | B-tree |
| `idx_tg_conversations_created_at` | `created_at DESC` | B-tree |

#### `tg_messages` — 6 index :

| Index | Colonnes | Type |
|-------|----------|------|
| PK | `id` | PRIMARY KEY |
| `idx_tg_messages_conversation_id` | `conversation_id` | B-tree |
| `idx_tg_messages_conversation_created` | `(conversation_id, created_at ASC)` | B-tree |
| `idx_tg_messages_direction` | `direction` | B-tree |
| `idx_tg_messages_tg_message_id_nonpartial` | `tg_message_id` | B-tree |
| `uq_tg_messages_conv_tg_msg` | `(conversation_id, tg_message_id)` | UNIQUE constraint |

### Index `(tg_chat_id, model_id)` : **MISSING**

Il n'existe pas d'index composite sur `(tg_chat_id, model_id)`. L'index sur `model_id` seul existe (partiel), et l'index unique sur `tg_chat_id` seul existe. Mais un index composite pour supporter un éventuel UPSERT multi-modèle n'est pas présent.

### Couverture des requêtes GET /messages :

- `GET /messages` par `conversation_id` : **COUVERT** par `idx_tg_messages_conversation_created`
- `GET /messages` par `tg_message_id` : **COUVERT** par `idx_tg_messages_tg_message_id_nonpartial`
- Requête de dédup upsert : **COUVERT** par `uq_tg_messages_conv_tg_msg`

---

## VERDICT FINAL

### Le schéma supporte-t-il multi-modèles ? **NON**

Le schéma actuel impose **1 conversation = 1 tg_chat_id** (contrainte UNIQUE). Il est structurellement impossible d'avoir un spender avec des conversations séparées par modèle.

---

## CE QUI EST SAIN — NE PAS TOUCHER

1. **`tg_messages` schema et index** — bien conçu, upsert idempotent via `(conversation_id, tg_message_id)` UNIQUE constraint
2. **RLS policies** — logique de filtrage chatter/gerant correcte et bien structurée
3. **RPC `upsert_tg_conversation`** — idempotente, COALESCE pour ne pas écraser les valeurs existantes
4. **Index `tg_conversations`** — bonne couverture pour les cas d'usage actuels (mono-modèle)
5. **Pipeline d'ingestion** (`handleMessage.ts`) — séquencement correct : conv → msg → spender → enrich → notify
6. **Backfill username/tg_user_id/display_name** (migration 20260331) — correct et prudent

---

## MIGRATION SQL NÉCESSAIRE (si multi-modèle requis)

> **NE PAS EXÉCUTER** — proposition pour revue uniquement

### Option A — Clé composite `(tg_chat_id, model_id)` (breaking change)

```sql
-- ⚠️ BREAKING: modifie la contrainte fondamentale du schéma
-- Prérequis: s'assurer que model_id est peuplé sur TOUTES les rows existantes

BEGIN;

-- 1. Rendre model_id NOT NULL (après backfill)
-- UPDATE tg_conversations SET model_id = '<default-model-uuid>' WHERE model_id IS NULL;
-- ALTER TABLE tg_conversations ALTER COLUMN model_id SET NOT NULL;

-- 2. Remplacer la contrainte UNIQUE
ALTER TABLE tg_conversations DROP CONSTRAINT tg_conversations_tg_chat_id_key;
ALTER TABLE tg_conversations ADD CONSTRAINT uq_tg_conv_chat_model
  UNIQUE (tg_chat_id, model_id);

-- 3. Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_tg_conv_chat_model
  ON tg_conversations (tg_chat_id, model_id);

-- 4. Adapter la RPC upsert_tg_conversation pour accepter p_model_id
-- CREATE OR REPLACE FUNCTION upsert_tg_conversation(
--   p_tg_chat_id TEXT, p_model_id UUID, ...
-- ) ...
-- ON CONFLICT (tg_chat_id, model_id) DO UPDATE ...

COMMIT;
```

### Impact de la migration :

| Composant | Impact |
|-----------|--------|
| `upsert_tg_conversation` RPC | Doit accepter `p_model_id` |
| `handleMessage.ts` | Doit passer `model_id` à la RPC |
| Frontend lookups `.eq("tg_chat_id", cid).maybeSingle()` | **CASSÉ** → doit ajouter `.eq("model_id", mid)` ou utiliser `.select()` (array) |
| RLS policies | Déjà correctes (filtrent par `model_id` via la conversation) |
| `index.html` ~6 occurrences `.maybeSingle()` | Toutes à migrer vers clé composite |

### Option B — Garder mono-conversation, ajouter `model_id` comme métadonnée

Si le business model est "1 spender = 1 conversation partagée entre modèles", le schéma actuel est correct. Il faut alors :
- Documenter que `model_id` sur `tg_conversations` = "dernier modèle actif" (pas "modèle unique")
- Ajouter `model_id` sur `tg_messages` pour savoir quel modèle a envoyé chaque message
- Adapter le frontend pour afficher les messages groupés par modèle dans une même conversation

---

## RÉSUMÉ BINAIRE

| # | Question | Réponse |
|---|----------|---------|
| 1 | Contrainte | **(a) `tg_chat_id` seul** — `UNIQUE (tg_chat_id)`, pas de clé composite |
| 2 | `model_id` | `tg_conversations`: **PRÉSENT, NULLABLE** / `tg_messages`: **ABSENT** |
| 3 | Spenders multi-modèles en DB | **0 trouvés** — structurellement impossible (UNIQUE sur `tg_chat_id`) |
| 4 | RLS filtre `model_id` | **OUI** — chatter filtré par `assigned_models`, mais `NULL` = invisible |
| 5 | Index `(tg_chat_id, model_id)` | **MISSING** |

**Verdict** : Le schéma **NE SUPPORTE PAS** le multi-modèle. Décision business requise : Option A (séparation) ou Option B (conversation partagée).
