# Ce que le CRM doit désormais lire — API canonique Spender

**Date** : 2026-03-16  
**Migration** : `20260316_spender_canonical_compat_layer.sql`

---

## Table / View à utiliser

**Une seule API de lecture** : `public.v_spenders`

```sql
SELECT * FROM public.v_spenders;
```

Ne pas lire `public.spenders` directement pour l'affichage UI. La view expose des colonnes normalisées avec fallbacks depuis `meta`.

---

## Colonnes canoniques (à lire par le CRM)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `tg_user_id` | BIGINT/TEXT | ID Telegram (type brut) |
| `tg_user_id_text` | TEXT | ID Telegram normalisé (digits) — **à utiliser pour comparaison JS** `String(a) === String(b)` |
| `telegram_id` | TEXT | Alias legacy (tg_user_id ou colonne telegram_id) |
| `username` | TEXT | @handle ou tg_123456 |
| `handle` | TEXT | Idem username |
| `display_name` | TEXT | Nom affiché |
| `name` | TEXT | Alias display_name |
| `first_name` | TEXT | Prénom |
| `age` | INTEGER | Âge |
| `job` | TEXT | Métier |
| `city` | TEXT | Ville |
| `country` | TEXT | Pays |
| `language` | TEXT | Langue (FR, EN, …) |
| `langue` | TEXT | Alias language |
| `notes_chatter` | TEXT | Notes chatter |
| `notes` | TEXT | Alias notes_chatter |
| `relationship` | TEXT | Statut relationnel |
| `relationship_status` | TEXT | Alias relationship |
| `source` | TEXT | Source (telegram_autofill, manual, …) |
| `budget_range` | TEXT | Budget |
| `timezone` | TEXT | Fuseau |
| `whatsapp_phone` | TEXT | Téléphone WhatsApp |
| `profile_updated_at` | TIMESTAMPTZ | Dernière mise à jour profil |
| `last_activity_at` | TIMESTAMPTZ | Dernière activité |
| `created_at` | TIMESTAMPTZ | Création |
| `updated_at` | TIMESTAMPTZ | Mise à jour |
| `meta` | JSONB | Données brutes (debug) — **ne pas parser en UI** |
| `status` | TEXT | active, etc. |
| `telegram_username` | TEXT | @username |
| `classification` | TEXT | new, vip, … |

---

## Règles

1. **Ne plus parser `meta`** pour les champs d'affichage : utiliser les colonnes normalisées.
2. **Comparaison `tg_user_id`** : utiliser `tg_user_id_text` ou `String(tg_user_id) === String(other)`.
3. **Lookup par id** : `v_spenders` où `id = ?`
4. **Lookup par tg_user_id** : `v_spenders` où `tg_user_id_text = ?` ou `tg_user_id::text = ?`

---

## Fonctions utilitaires

| Fonction | Usage |
|----------|-------|
| `fn_spender_apply_enrichment(spender_id, patch_json, source)` | Appliquer un patch d'enrichissement |
| `fn_merge_spenders(old_id, new_id)` | Fusionner deux spenders (réaffecte FK, archive l'ancien) |
