# DADASH — Couche de compatibilité (Sync TG + Activity feed)

## Résumé

| Problème | Solution |
|----------|----------|
| `tg_conversations.tg_username does not exist` | Migration additive: colonnes `tg_username`, `tg_user_id`, `tg_peer_id`, `username`, `display_name` |
| Activity bar Enrichment/Messages vides | VIEW `v_activity_feed_unified` + extension `event_type` (enriched, spender_enriched, message) |
| Bot n'écrit pas d'events message | `handleMessage.ts` : appel `fn_insert_spender_event('new_message', ...)` |

---

## Tâche A — Audit (colonnes exactes)

Exécuter le fichier `supabase/migrations/20260226_dadash_compat_audit.sql` pour lister les colonnes et contraintes.

**Colonnes attendues vs présentes (tg_conversations):**

| Colonne attendue (front) | Avant migration | Après |
|--------------------------|-----------------|-------|
| id | ✅ | ✅ |
| tg_chat_id | ✅ | ✅ |
| tg_peer_id | ❌ | ✅ |
| tg_user_id | ❌ | ✅ |
| username | ❌ | ✅ |
| tg_username | ❌ | ✅ |
| display_name | ❌ | ✅ |
| spender_id | ✅ | ✅ |

---

## Tâche B — Migrations compat (Sync TG)

**Option choisie:** Option 1 — migration additive (colonnes nullable).

Fichier: `supabase/migrations/20260227_dadash_compat_layer.sql`

- `ALTER TABLE tg_conversations ADD COLUMN` pour tg_user_id, tg_peer_id, tg_username, username, display_name, tg_first_name, tg_last_name, tg_display_name
- Backfill depuis tg_chat_id (DMs) et spenders
- Trigger `trg_sync_conv_from_message` : à chaque nouveau message, met à jour la conv avec meta (username, display_name)

---

## Tâche C — Activity feed (3 catégories)

- **v_activity_feed_unified** : category = 'new_spender' | 'enrichment' | 'message'
- **fn_get_activity_feed_unified(limit, offset, category)** : RPC paginée
- **v_activity_feed** : mis à jour pour inclure enriched, spender_enriched, message
- **event_type** étendu : enriched, spender_enriched, message

Mapping catégories:
- `new_spender` ← new_spender, spender_created
- `enrichment` ← profile_updated, enriched, spender_enriched, classification_changed, handle_set, status_changed
- `message` ← new_message, message, tx_created

---

## Checklist tests SQL

Fichier: `supabase/migrations/20260227_dadash_compat_tests.sql`

1. `SELECT ... FROM tg_conversations` — pas d'erreur colonne manquante
2. `SELECT ... FROM v_activity_feed WHERE event_type IN ('new_spender', ...)`
3. Idem pour enrichment et messages
4. `SELECT category, COUNT(*) FROM v_activity_feed_unified GROUP BY category`
5. `SELECT * FROM fn_get_activity_feed_unified(10, 0, NULL)`

---

## Ordre d'exécution

1. `20260226_dadash_compat_audit.sql` (optionnel, diagnostic)
2. `20260227_dadash_compat_layer.sql` (migrations)
3. `20260227_dadash_compat_tests.sql` (validation)
