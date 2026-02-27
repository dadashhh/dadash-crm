# Audit DADASH — Source of Truth & Write Path (Enrichissements Telegram → CRM)

**Date** : 2026-02-27  
**Objectif** : Identifier pourquoi les enrichissements Telegram n'apparaissent pas dans les fiches Spender du CRM, alors que les notifications "Spender Enriched" arrivent.

---

## 1. Pipeline end-to-end (tracé)

```
[Telegram] → message reçu
     │
     ▼
[autofill/src/ingest/handleMessage.ts]
     │ 1) upsert_tg_conversation(p_tg_chat_id) → conversation_id
     │ 2) INSERT tg_messages (conversation_id, text, meta: {tg_user_id, username, display_name})
     │ 3) writeSpenderEvent('message', idempotency: msg:{tgUserId}:{msgId})
     │ 4) upsertSpender(tgUserId, username, firstName, lastName)
     │ 5) enqueueEnrich(conversationId, tgUserId, lastMessageId)
     ▼
[tg_conversations] [tg_messages] [spender_events] [spenders] [spender_enrich_queue]
     │                                                              │
     │                                                              ▼
     │                                    [autofill/src/worker/enrichWorker.ts]
     │                                    fn_claim_enrich_job() → job
     │                                    extractProfile(messages) → profile
     │                                    structureExtractedProfile() → meta.profile schema
     │                                    flattenForEnrichmentRpc() → flat JSON
     │                                    fn_apply_spender_enrichment(spender_id, tg_user_id, enrichment)
     │                                                              │
     │                                                              ▼
     │                                    [spenders] UPDATE meta + colonnes top-level
     │                                    [spender_events] INSERT profile_updated
     │
     ▼
[CRM index.html]
  apiFetchSpenders() → v_spenders.select("*")
  Activity feed → v_activity_new_spenders, v_activity_enrichments, v_activity_messages
  Clic activité → openSpenderById(spender_id) ou openSpenderByTgUserId(tg_user_id)
```

---

## 2. Tableau SOURCE OF TRUTH (où le CRM lit)

| Écran UI | Table/View | Colonnes lues | Fichier / Ligne |
|----------|------------|---------------|-----------------|
| **Spenders list** | `v_spenders` | `id`, `tg_user_id`, `handle`, `name`, `first_name`, `age`, `city`, `country`, `job`, `langue` (alias `language`), `notes`, `meta`, `status`, `telegram_username`, `whatsapp_phone`, `created_at`, `updated_at`, `last_activity_at` | index.html ~2350, ~7691 |
| **Spender card** (grille) | `v_spenders` via `dbSpenders` | `first_name`, `age`, `city`, `langue`, `timezone` — via `getSpenderMetaProfile(s)` qui lit `s.meta.profile.identity`, `s.meta.profile.location`, `s.meta.profile.language`, `s.status.relation` OU colonnes top-level `s.first_name`, `s.age`, etc. | index.html ~8069, ~8097 |
| **Spender modal** (fiche détail) | `v_spenders` | Même schéma + `relationship_status`, `budget_range`, `telegram_username`, `whatsapp_phone`, `dbNotes` (notes) | index.html ~7615, ~8262 |
| **Activity drawer** (onglets) | `v_activity_new_spenders`, `v_activity_enrichments`, `v_activity_messages` | `id`, `created_at`, `title`, `subtitle`, `detail`, `tg_user_id`, `spender_id`, `payload`, `type` | index.html ~2279, ~2309 |
| **Clic activité → ouverture fiche** | `v_spenders` | Lookup par `spender_id` ou `tg_user_id` | index.html ~7510-7562, ~7626, ~7642 |

---

## 3. Tableau WRITE PATH (où le bot/worker écrit)

| Action | Table/Colonne écrite | Fichier / RPC |
|--------|---------------------|---------------|
| **Nouveau message TG** | `tg_messages` (conversation_id, text, direction, tg_message_id, meta) | handleMessage.ts ~45 |
| **Nouveau message TG** | `spender_events` (tg_user_id, event_type='message', idempotency_key, data) | handleMessage.ts ~72, writeSpenderEvent |
| **Nouveau spender** | `spenders` (handle, display_name, name, first_name, tg_user_id, telegram_username, meta.profile.telegram, last_seen_at) | upsertSpender.ts ~94-108 |
| **Nouveau spender** | `spender_events` (event_type='new_spender') | upsertSpender.ts ~131 |
| **Enqueue enrich** | `spender_enrich_queue` (conversation_id, tg_user_id, last_message_id) | enqueueEnrich.ts, fn_enqueue_enrich |
| **Enrichissement** | `spenders` : `meta.profile.identity` (age, first_name), `meta.profile.location` (city, country), `meta.profile` (job, language, notes_chatter, relationship_status, budget_range), + colonnes top-level `first_name`, `age`, `job`, `city`, `country`, `langue`, `notes`, `relationship_status`, `budget_range`, `whatsapp_phone` | fn_apply_spender_enrichment (20260312, 20260313) |
| **Enrichissement** | `spender_events` (event_type='profile_updated', spender_id, data: {summary, fields, added, enrichment}) | fn_apply_spender_enrichment |

---

## 4. Clé d'identité du spender

| Contexte | Clé utilisée | Type | Unicité |
|----------|--------------|------|---------|
| **spenders** | `tg_user_id` | BIGINT (migration 001) ou TEXT (migration 20260313) | UNIQUE WHERE NOT NULL |
| **spender_events** | `tg_user_id` + `spender_id` | BIGINT / UUID | - |
| **spender_enrich_queue** | `conversation_id` (UNIQUE), `tg_user_id` | UUID, BIGINT | UNIQUE(conversation_id) |
| **tg_conversations** | `tg_chat_id`, `tg_user_id` (DM: chat_id = user_id) | TEXT, BIGINT | - |
| **Match CRM** | `spender_id` (UUID) ou `tg_user_id` | - | - |

**Problèmes potentiels** :
- Si migration 20260313 appliquée : `spenders.tg_user_id` peut être TEXT (digits), `spender_events.tg_user_id` reste BIGINT → JOIN via `normalize_tg_user_id()`.
- `upsert_tg_conversation` ne reçoit que `p_tg_chat_id` : pour les DMs, `tg_chat_id` = user_id, mais `tg_conversations.tg_user_id` n'est pas mis à jour à la création (seulement par trigger `tg_sync_conv_from_message` ou backfill).

---

## 5. Mismatches identifiés

### A) `v_spenders` ne expose pas `relationship_status`

- **Écrit** : `fn_apply_spender_enrichment` met à jour `spenders.relationship_status` et `meta.profile.relationship_status`.
- **Lu** : `getSpenderMetaProfile` lit `p.status?.relation || p.relationship_status || sp.relationship_status`.
- **Problème** : La vue `v_spenders` (20260312, 20260310) n'inclut pas `s.relationship_status`. Le tableau `spenders` dans le CRM est construit sans `meta` (index.html ~7691) : on ne passe que des champs explicites. Donc `sp.relationship_status` est `undefined` et `sp.meta` absent → relation non affichée.

### B) `v_spenders` ne expose pas `telegram_id` (legacy)

- **Lu** : Le CRM utilise `dbSp.telegram_id` (index.html ~6928, ~7321, ~7529).
- **Écrit** : Le pipeline utilise `tg_user_id`. La colonne `telegram_id` existe (migrations crm_bots_integration, create_all_missing_tables) mais n'est pas alimentée par le bot.
- **Problème** : Si `v_spenders` n'alias pas `tg_user_id AS telegram_id`, les endroits qui lisent `telegram_id` peuvent être vides.

### C) Filtre `is_active` sur `v_spenders` (migration 20260313)

- Si `20260313_dadash_pipeline_compat` est appliquée : `v_spenders` a `WHERE s.is_active = true`.
- Les nouveaux spenders créés par `upsertSpender` n'ont pas `is_active` défini explicitement ; la colonne a `DEFAULT true` (20260313_dadash_tg_ids_zero_confusion).
- **Risque** : Spenders archivés (`is_active = false`) disparaissent de la liste, ce qui est voulu. Pas de bug si la migration est cohérente.

### D) "Spender introuvable (données manquantes)"

- **Contexte** : Clic sur un item d'activité (ex. "Spender Enriched").
- **Logique** : On résout le spender par `spender_id` ou `tg_user_id` dans `spenders` et `dbSpenders` (index.html ~7509-7558).
- **Causes possibles** :
  1. `spender_id` ou `tg_user_id` null dans l'activité (JOIN spender_events ↔ spenders échoue).
  2. Spender filtré par `is_active = false` dans `v_spenders`.
  3. `tg_user_id` en BIGINT vs TEXT : comparaison `String(s.tg_user_id) === String(feedItem.tg_user_id)` devrait fonctionner.
  4. `dbSpenders` pas encore rechargé après enrichissement (données stale).

### E) Mapping `structureExtractedProfile` → `flattenForEnrichmentRpc`

- `structureExtractedProfile` met `relationship_status` dans `status.relation`.
- `flattenForEnrichmentRpc` lit `status.relation` → `relationship_status` ✅
- `fn_apply_spender_enrichment` attend `relationship_status` en clé plate ✅

### F) `spender_events.event_type` : `message` vs `new_message`

- `handleMessage` appelle `writeSpenderEvent(..., eventType: 'message')`.
- Les vues/contraintes acceptent `message` (compat layer 20260227).
- Pas de conflit.

---

## 6. Changements à faire (groupés)

### DB (migrations / views / constraints)

| Priorité | Changement | Fichier / Action |
|----------|------------|-------------------|
| **P0** | Exposer `relationship_status` dans `v_spenders` | Migration : ajouter `s.relationship_status` (ou COALESCE depuis meta) dans la vue |
| **P0** | Exposer `telegram_id` dans `v_spenders` pour compat legacy | Alias `s.tg_user_id::text AS telegram_id` ou colonne dédiée si elle existe |
| **P1** | S'assurer que `spender_events.spender_id` est rempli par `fn_apply_spender_enrichment` | Déjà le cas (p_spender_id passé) |
| **P2** | Vérifier ordre des migrations (20260311, 20260312, 20260313) pour éviter écrasement de vues | Audit ordre d'exécution |

### Bot / Worker (write mapping / upsert / id matching)

| Priorité | Changement | Fichier |
|----------|------------|---------|
| **P1** | Garantir que `upsertSpender` définit `is_active = true` si la colonne existe | autofill/src/spenders/upsertSpender.ts |
| **P2** | Synchroniser `tg_conversations.tg_user_id` à la création (quand DM) | Trigger ou adaptation de `upsert_tg_conversation` |

### CRM (read queries / mapping / fallback)

| Priorité | Changement | Fichier |
|----------|------------|---------|
| **P0** | Inclure `meta` dans l'objet spender construit depuis `dbSpenders` | index.html ~7691 : ajouter `meta: dbSp.meta` dans `map[h]` |
| **P1** | Fallback `telegramId: dbSp.telegram_id ?? dbSp.tg_user_id` | index.html ~7703 |
| **P2** | Rafraîchir `dbSpenders` après clic sur activité (ou subscription realtime) | Pour éviter "Spender introuvable" sur données stale |

---

## 7. Correctifs proposés

### Hotfix minimal (sans migration)

1. **index.html** : Ajouter `meta: dbSp.meta || {}` dans la construction de l'objet spender (ligne ~7691) pour que `getSpenderMetaProfile` puisse lire `meta.profile`.
2. **index.html** : Utiliser `telegramId: dbSp.telegram_id ?? dbSp.tg_user_id ?? null` pour compat legacy.

### Correctif propre (long terme)

1. **Migration SQL** : `supabase/migrations/20260315_v_spenders_enrich_compat.sql` — ajoute à `v_spenders` :
   - `relationship_status` (COALESCE colonne + meta.profile)
   - `telegram_id` (COALESCE colonne legacy + tg_user_id::text)
2. **Bot** : S'assurer que `upsertSpender` et `fn_apply_spender_enrichment` restent alignés sur le schéma `meta.profile`.
3. **CRM** : Conserver le fallback `getSpenderMetaProfile` pour les champs dans `meta` même si les colonnes top-level sont remplies.

---

## 8. Références code

| Élément | Fichier | Lignes |
|---------|---------|--------|
| apiFetchSpenders | index.html | 2349-2351 |
| getSpenderMetaProfile | index.html | 2419-2436 |
| spenderVM | index.html | 2437-2441 |
| Construction spenders depuis dbSpenders | index.html | 7691-7734 |
| Clic activité → résolution spender | index.html | 7509-7562 |
| fn_apply_spender_enrichment | 20260312_pipeline_spender_enrichment.sql, 20260313_dadash_pipeline_compat.sql | - |
| v_spenders | 20260312, 20260310_compat_layer_incassable, 20260313 | - |
| structureExtractedProfile, flattenForEnrichmentRpc | autofill/src/utils/spenderHelpers.ts | 84-127 |
| upsertSpender | autofill/src/spenders/upsertSpender.ts | 35-140 |
| handleMessage | autofill/src/ingest/handleMessage.ts | 24-112 |
| enrichWorker | autofill/src/worker/enrichWorker.ts | 62-155 |
