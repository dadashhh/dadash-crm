# DADASH — Migration IDs Telegram zéro confusion

## Liens des fichiers

| Fichier | Description |
|---------|-------------|
| [supabase/migrations/20260313_dadash_tg_ids_zero_confusion.sql](../supabase/migrations/20260313_dadash_tg_ids_zero_confusion.sql) | Migration principale: normalize, merge_spender, colonnes |
| [supabase/migrations/20260313_dadash_pipeline_compat.sql](../supabase/migrations/20260313_dadash_pipeline_compat.sql) | Pipeline auto + views compat |
| [supabase/migrations/20260313_dadash_audit_plan.md](../supabase/migrations/20260313_dadash_audit_plan.md) | Audit DB + plan migration |
| [supabase/migrations/20260313_dadash_verify_queries.sql](../supabase/migrations/20260313_dadash_verify_queries.sql) | Queries de vérification |

## Ordre d'exécution

```bash
# 1. Migration principale
psql $DATABASE_URL -f supabase/migrations/20260313_dadash_tg_ids_zero_confusion.sql

# 2. Pipeline + compat layer
psql $DATABASE_URL -f supabase/migrations/20260313_dadash_pipeline_compat.sql

# 3. Vérification
psql $DATABASE_URL -f supabase/migrations/20260313_dadash_verify_queries.sql
```

## Si doublons détectés

```sql
-- Lister les doublons
SELECT public.normalize_tg_user_id(tg_user_id) AS n, COUNT(*), array_agg(id)
FROM public.spenders WHERE tg_user_id IS NOT NULL AND is_active = true
GROUP BY public.normalize_tg_user_id(tg_user_id) HAVING COUNT(*) > 1;

-- Fusionner (garder le plus ancien ou celui avec le plus de transactions)
SELECT public.merge_spender('old-uuid', 'new-uuid');

-- Puis créer l'index unique manuellement
CREATE UNIQUE INDEX uq_spenders_tg_user_id_normalized
  ON public.spenders (public.normalize_tg_user_id(tg_user_id))
  WHERE tg_user_id IS NOT NULL AND is_active = true;
```

## Résumé des changements

- **normalize_tg_user_id(input)** → TEXT (digits only)
- **tg_user_id** : BIGINT → TEXT dans spenders, spender_events, spender_enrich_queue, tg_conversations
- **merge_spender(old_id, new_id)** : réaffecte FK, archive (is_active=false), log event
- **Triggers** : tg_messages + spender_events → upsert spender + enrich_queue
- **Views** : v_spenders, v_tg_conversations, v_tg_messages, v_activity_feed, v_spender_events, v_spender_enrichments
