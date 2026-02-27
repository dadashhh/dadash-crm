# DADASH — Front compat layer + Realtime

## Points d'intégration Supabase

### Views consommées (jamais les tables directes)

| View | Usage |
|------|-------|
| `v_spenders` | Liste spenders, fiche spender, lookup par id/tg_user_id |
| `v_activity_feed` | Activity panel (All) |
| `v_activity_new_spenders` | Onglet New Spenders |
| `v_activity_enrichments` | Onglet Enrichment |
| `v_activity_messages` | Onglet Messages |
| `v_tg_conversations` | Sync TG, messagerie (tg_username exposé) |
| `v_tg_messages` | Messages par conversation |
| `v_spender_enrich_queue` | Admin debug |

### RPC stables

- `fn_upsert_spender_from_tg(p_tg_user_id TEXT, p_username, p_display_name, p_meta)` — tg_user_id en TEXT
- `fn_refresh_spender_from_tg(p_spender_id UUID)` — bouton Sync TG
- `fn_merge_spender(old_id, new_id)` — fusion doublons

### Realtime channels

- `spender_events` INSERT → refresh UI (dédupliqué par event id)
- `tg_messages` INSERT → refresh UI
- `spenders` UPDATE → refresh + badge UPDATED si fiche ouverte

## Checks UI/QA

1. **Activity panel** : All / New Spenders / Enrichment / Messages — clic ouvre fiche spender
2. **Sync TG** : pas d'erreur "tg_username missing" (v_tg_conversations)
3. **Fiche spender** : badge UPDATED quand enrichment arrive en realtime
4. **Admin > Pipeline Debug** : derniers events, enrich, messages, spender_id résolu
