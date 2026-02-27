# DADASH Front — Compat layer notes

## VIEW/RPC attendues côté DB

| Objet | Usage |
|-------|-------|
| **v_activity_feed** | Activity bar — colonnes: id, event_type, tg_user_id, username, title, subtitle, created_at, data |
| **fn_get_activity_feed_unified(limit, offset, category)** | RPC optionnelle — category = 'new_spender' \| 'enrichment' \| 'message' \| null |
| **tg_conversations** | Sync TG — colonnes safe: id, tg_chat_id, tg_peer_id, tg_user_id, spender_id (pas tg_username/username) |
| **spender_events** | Fallback activity — id, tg_user_id, event_type, data, created_at |
| **tg_messages** | Fallback onglet Messages — id, conversation_id, direction, text, created_at, meta |

## Logs console

- `[ACTIVITY]` — fetch activity (v_activity_feed, RPC, fallback)
- `[SYNC_TG]` — sync TG (total, created, updated)
- `[SPENDERS]` — chargement spenders
- `[REFRESH]` — apiHardRefresh

## Mapping meta.profile (bot enrich)

Helper central `getProfile(meta)` (index.html) lit les champs depuis `meta.profile` avec fallback ancien mapping:

- `meta.profile.identity.first_name` ou `meta.profile.first_name` → prénom
- `meta.profile.identity.age` ou `meta.profile.age` → âge
- `meta.profile.location.city` ou `meta.profile.city` → ville
- `meta.profile.location.country` ou `meta.profile.country` → pays
- `meta.profile.location.timezone` → timezone
- `meta.profile.language` ou `meta.profile.langue` → langue
- `meta.profile.status.relation` ou `meta.profile.relationship_status` → relation
- `meta.profile.notes_chatter` → notes chatter
- `meta.profile.budget.chf_range` ou `meta.profile.budget_range` → budget CHF
- `meta.profile.telegram.username` → @username (display)

## Sync TG — colonnes safe

Le Sync TG n'utilise plus `tg_username`, `username`, `display_name` sur tg_conversations.
Il lit uniquement: `id`, `tg_chat_id`, `tg_peer_id`, `tg_user_id`, `spender_id`.
Pour les nouveaux spenders: handle = `tg_` + tg_user_id.
