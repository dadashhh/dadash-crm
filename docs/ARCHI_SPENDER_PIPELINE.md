# Architecture du Pipeline Spender (Telegram → DB)

> **Date** : 2026-02-26  
> **Auteur** : Architecture DB  
> **Statut** : Production-ready

---

## 1. Source of Truth

Le pipeline repose sur **3 tables** avec des rôles clairement séparés :

| Table | Rôle | Mutabilité |
|---|---|---|
| `spenders` | **État courant** — snapshot du profil spender | Mutable (upsert) |
| `spender_events` | **Event log** — audit + activity feed UI | Immuable (append-only) |
| `spender_enrich_queue` | **Orchestration** — file d'enrichissement | Mutable (state machine) |

### Principe fondamental

```
spenders.meta     = "ce que le spender EST maintenant"
spender_events.data = "ce qui a CHANGÉ + résumé de l'événement"
```

Les **events** ne sont JAMAIS modifiés ou supprimés. Le `spenders` row est le snapshot calculé à partir des events.

---

## 2. Schéma des tables

### 2.1 `spenders`

```sql
spenders (
  id              UUID PK,
  tg_user_id      BIGINT UNIQUE (partial: WHERE NOT NULL),
  handle          TEXT,
  name            TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  last_seen_at    TIMESTAMPTZ,
  classification  TEXT DEFAULT 'new',
  updated_at      TIMESTAMPTZ DEFAULT now(),  -- auto via trigger
  created_at      TIMESTAMPTZ DEFAULT now(),
  -- + colonnes enrichissement: age, city, job, source, etc.
)
```

**Contraintes clés** :
- `UNIQUE(tg_user_id)` — un seul spender par user Telegram
- Trigger `trg_spenders_updated_at` — auto-update `updated_at`

### 2.2 `spender_events`

```sql
spender_events (
  id              UUID PK DEFAULT gen_random_uuid(),
  tg_user_id      BIGINT NOT NULL,
  event_type      TEXT NOT NULL CHECK (...),
  idempotency_key TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Contraintes clés** :
- `UNIQUE(event_type, tg_user_id, idempotency_key)` — dedup totale
- `CHECK(event_type IN ('new_spender', 'profile_updated', 'new_message', ...))` — types contrôlés

**event_types autorisés** :
| Type | Description |
|---|---|
| `new_spender` | Premier contact Telegram |
| `profile_updated` | Changement de profil (meta, classification) |
| `new_message` | Nouveau message dans une conversation |
| `status_changed` | Changement de statut |
| `classification_changed` | Changement de classification (new→vip, etc.) |
| `spender_created` | Création manuelle depuis le CRM |
| `tx_created` | Transaction associée |
| `handle_set` | Handle Telegram défini/modifié |

### 2.3 `spender_enrich_queue`

```sql
spender_enrich_queue (
  id              UUID PK,
  conversation_id UUID NOT NULL UNIQUE,
  tg_user_id      BIGINT NOT NULL,
  status          TEXT CHECK ('queued','processing','done','failed'),
  attempts        INTEGER DEFAULT 0,
  error           TEXT NULL,
  locked_at       TIMESTAMPTZ NULL,
  locked_by       TEXT NULL,
  last_message_id BIGINT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
)
```

**Machine à états** :

```
queued → processing → done
                  ↘ failed → queued (re-enqueue)
```

---

## 3. Stratégie d'idempotence

### 3.1 Spenders

L'upsert se fait sur `tg_user_id` :

```sql
INSERT INTO spenders (tg_user_id, handle, meta, last_seen_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (tg_user_id) WHERE tg_user_id IS NOT NULL
DO UPDATE SET meta = $3, last_seen_at = now();
```

### 3.2 Events

Chaque event porte un `idempotency_key` unique par type + user :

```sql
-- Exemple : nouveau message → key = message_id Telegram
SELECT fn_insert_spender_event(
  p_tg_user_id      := 123456789,
  p_event_type      := 'new_message',
  p_idempotency_key := 'msg_42',  -- tg_message_id
  p_data            := '{"text":"Hello","chat_id":"789"}'::jsonb
);
-- Appel répété = même résultat, pas de doublon
```

**Convention des idempotency_keys** :

| Event type | Key format | Exemple |
|---|---|---|
| `new_spender` | `tg_{tg_user_id}` | `tg_123456789` |
| `new_message` | `msg_{tg_message_id}` | `msg_42` |
| `profile_updated` | `profile_{timestamp_iso}` | `profile_2026-02-26T12:00:00Z` |
| `classification_changed` | `class_{old}_{new}` | `class_new_vip` |

### 3.3 Enrich Queue

Idempotence via `UNIQUE(conversation_id)` + `fn_enqueue_enrich()` :

```sql
-- Re-enqueue un job terminé = remet en 'queued'
-- Double-enqueue un job 'queued' = no-op (update last_message_id seulement)
SELECT fn_enqueue_enrich(
  p_conversation_id := 'abc-def-123',
  p_tg_user_id      := 123456789,
  p_last_message_id  := 42
);
```

Anti double-run via `SELECT ... FOR UPDATE SKIP LOCKED` dans `fn_claim_enrich_job()`.

---

## 4. RLS (Row Level Security)

| Table | Lecture (JWT) | Écriture (JWT) | Service Role |
|---|---|---|---|
| `spenders` | gerant ✅ chatter ✅ | gerant ✅ (CRM) | bypass RLS |
| `spender_events` | gerant ✅ chatter ✅ | ❌ (aucune policy) | bypass RLS |
| `spender_enrich_queue` | gerant ✅ (debug) | ❌ (aucune policy) | bypass RLS |

> **Règle** : le bot/worker écrit **toujours** via `service_role` key (bypass RLS natif Supabase).  
> Les policies ci-dessus ne concernent que les accès depuis le frontend (JWT).

---

## 5. Flux de données

```
Telegram Bot API
      │
      ▼
  [Worker / Bot]  ── service_role ──▶  tg_conversations
      │                                  tg_messages
      │
      ├─▶ UPSERT spenders (tg_user_id)
      ├─▶ INSERT spender_events (idempotent via ON CONFLICT)
      └─▶ ENQUEUE spender_enrich_queue (fn_enqueue_enrich)
                    │
                    ▼
            [Enrich Worker]
              fn_claim_enrich_job()
                    │
              (enrichissement IA/API)
                    │
              fn_complete_enrich_job()
                    │
                    ▼
            UPDATE spenders.meta
            INSERT spender_events('profile_updated')

  [Frontend CRM]  ── JWT (gerant/chatter) ──▶  SELECT v_activity_feed
                                                 SELECT spenders
                                                 RPC fn_get_activity_feed()
```

---

## 6. Debugging

### Voir les derniers events

```sql
SELECT * FROM v_activity_feed LIMIT 20;
```

### Vérifier l'idempotence d'un event

```sql
SELECT * FROM spender_events
 WHERE event_type = 'new_message'
   AND tg_user_id = 123456789
   AND idempotency_key = 'msg_42';
```

### État de la queue d'enrichissement

```sql
-- Jobs bloqués (processing depuis > 5 min)
SELECT * FROM spender_enrich_queue
 WHERE status = 'processing'
   AND locked_at < now() - INTERVAL '5 minutes';

-- Distribution par statut
SELECT status, count(*), max(updated_at) as last_activity
  FROM spender_enrich_queue
 GROUP BY status;

-- Jobs en erreur
SELECT conversation_id, tg_user_id, attempts, error, updated_at
  FROM spender_enrich_queue
 WHERE status = 'failed'
 ORDER BY updated_at DESC
 LIMIT 10;
```

### Vérifier la cohérence spender ↔ events

```sql
-- Spenders sans aucun event
SELECT s.id, s.tg_user_id, s.handle
  FROM spenders s
  LEFT JOIN spender_events e ON e.tg_user_id = s.tg_user_id
 WHERE e.id IS NULL
   AND s.tg_user_id IS NOT NULL;

-- Events sans spender associé
SELECT DISTINCT e.tg_user_id
  FROM spender_events e
  LEFT JOIN spenders s ON s.tg_user_id = e.tg_user_id
 WHERE s.id IS NULL
   AND e.tg_user_id <> 0;
```

### Vérifier les contraintes

```sql
-- Doublons tg_user_id dans spenders (ne devrait jamais arriver)
SELECT tg_user_id, count(*)
  FROM spenders
 WHERE tg_user_id IS NOT NULL
 GROUP BY tg_user_id
 HAVING count(*) > 1;

-- Vérifier les index
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename IN ('spenders', 'spender_events', 'spender_enrich_queue')
 ORDER BY tablename, indexname;
```

---

## 7. Comment appliquer les migrations

### Ordre d'exécution

Les migrations doivent être exécutées dans l'ordre :

```bash
# 1. Spenders (table principale)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_001_spenders.sql

# 2. Spender Events (event log)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_002_spender_events.sql

# 3. Enrich Queue (orchestration)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_003_enrich_queue.sql

# 4. Views & RPC (UI endpoints)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_004_views_rpc.sql

# 5. RLS (sécurité)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_005_rls.sql

# 6. Tests (vérification)
psql $DATABASE_URL -f supabase/migrations/20260226_spender_pipeline_006_tests.sql
```

### Ou via Supabase CLI

```bash
supabase db push
```

### Rollback

Toutes les migrations sont idempotentes. En cas de problème :

```sql
-- Rollback RLS (revenir aux anciennes policies)
DROP POLICY IF EXISTS spenders_read_app ON spenders;
DROP POLICY IF EXISTS spender_events_read_app ON spender_events;
DROP POLICY IF EXISTS enrich_queue_read_gerant ON spender_enrich_queue;

-- Restaurer les anciennes policies
CREATE POLICY spenders_select_all ON spenders FOR SELECT USING (true);
CREATE POLICY spenders_all_gerant ON spenders FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY spenders_update_chatter ON spenders FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
);
```

---

## 8. Conventions pour les développeurs

1. **Jamais d'écriture directe** sur `spenders` ou `spender_events` depuis le frontend
2. **Toujours passer par `service_role`** pour les écritures bot/worker
3. **Toujours fournir un `idempotency_key`** lors de l'insertion d'events
4. **Utiliser `fn_enqueue_enrich()`** plutôt qu'un INSERT direct dans la queue
5. **Utiliser `fn_claim_enrich_job()`** pour le worker (anti double-run)
6. **Utiliser `v_activity_feed`** ou `fn_get_activity_feed()` pour l'UI (pas de SELECT direct)
