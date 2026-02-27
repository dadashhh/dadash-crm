# DADASH — Audit DB + Plan de migration minimal-risk

## 1. AUDIT DB (état actuel)

### Tables clés

| Table | Colonne tg_user_id | Type actuel | Contraintes | Index |
|-------|-------------------|-------------|-------------|-------|
| spenders | tg_user_id | BIGINT ou TEXT | uq_spenders_tg_user_id (si pas de doublons) | idx_spenders_* |
| spender_events | tg_user_id | BIGINT | NOT NULL, chk_event_type | uq_spender_events_dedup |
| spender_enrich_queue | tg_user_id | BIGINT | NOT NULL | uq_enrich_queue_conversation_id |
| tg_conversations | tg_user_id | BIGINT | - | idx_tg_conversations_tg_user_id |

### FK vers spenders.id (ne jamais supprimer spender sans merge)

| Table | Colonne | ON DELETE |
|-------|---------|-----------|
| transactions | spender_id | (restrict par défaut) |
| tg_conversations | spender_id | - |
| spender_events | spender_id | SET NULL |
| push_recipients | spender_id | - |
| platform_fans | spender_id | SET NULL |
| wa_analysis_logs | spender_id | - |

### RLS

- spenders: gerant ALL, chatter READ
- spender_events: gerant/chatter READ, service_role WRITE
- spender_enrich_queue: gerant READ, service_role WRITE

### Triggers existants

- trg_spenders_updated_at
- trg_sync_conv_from_message (tg_messages)
- trg_enrich_queue_updated_at

---

## 2. PLAN DE MIGRATION (ordre d'exécution)

### Étape 1 — Migration principale
```bash
psql $DATABASE_URL -f supabase/migrations/20260313_dadash_tg_ids_zero_confusion.sql
```

- Ajoute is_active, merged_into_id sur spenders
- Crée normalize_tg_user_id()
- Migre tg_user_id BIGINT → TEXT (digits)
- Unique index (si pas de doublons)
- merge_spender()
- Étend event_type pour spender_merged

### Étape 2 — Pipeline + compat
```bash
psql $DATABASE_URL -f supabase/migrations/20260313_dadash_pipeline_compat.sql
```

- fn_upsert_spender_from_tg (TEXT)
- fn_enqueue_enrich (TEXT)
- Triggers: tg_messages, spender_events
- Views: v_spenders, v_tg_conversations, v_activity_feed, v_spender_enrichments
- fn_apply_spender_enrichment (TEXT)

### Étape 3 — Si doublons détectés
Exécuter merge_spender pour chaque paire, puis:
```sql
CREATE UNIQUE INDEX uq_spenders_tg_user_id_normalized
  ON public.spenders (public.normalize_tg_user_id(tg_user_id))
  WHERE tg_user_id IS NOT NULL AND is_active = true;
```

---

## 3. FORMAT CANONIQUE

- **tg_user_id**: TEXT, digits only (ex: "123456789")
- **username**: TEXT optionnel (ex: "johndoe" ou "@johndoe")
- **normalize_tg_user_id(input)**: extrait digits, retourne NULL si vide

---

## 4. COMPAT LAYER (views stables)

L'app consomme ces views — colonnes garanties même si la source change:

| View | Colonnes clés |
|------|---------------|
| v_spenders | id, tg_user_id, username, handle, display_name, first_name, age, ... |
| v_tg_conversations | id, tg_chat_id, tg_peer_id, tg_user_id, tg_username, username, display_name, spender_id |
| v_activity_feed | id, type, tg_user_id, spender_id, title, subtitle, detail, created_at, payload |
| v_spender_enrichments | id, conversation_id, tg_user_id, status, ... |

Fallbacks: `tg_username = COALESCE(username, meta->'profile'->>'username', ...)`

---

## 5. RISQUES ET MITIGATIONS

| Risque | Mitigation |
|--------|------------|
| Doublons empêchent unique index | Migration vérifie avant; merge_spender manuel si besoin |
| Worker enrich attend BIGINT | fn_apply_spender_enrichment overload TEXT + BIGINT |
| transactions FK 23503 | merge_spender réaffecte avant archive, jamais DELETE |
| Récursion trigger | tg_on_spender_event ne crée spender que si absent |
