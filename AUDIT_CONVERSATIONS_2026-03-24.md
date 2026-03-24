# RAPPORT AUDIT CARLOS — 2026-03-24

## A. UPSERTS `tg_conversations`

**Nombre d'occurrences trouvées : 5** (2 upserts, 3 updates)

**Colonne utilisée : MIX** — `tg_chat_id` (3 occurrences) + `telegram_id` (2 occurrences legacy)

### Occurrence 1 — `main.py:437` — UPSERT (handler de messages entrants)

Appelé depuis `_ensure_tg_conversation()` (invoqué à `main.py:929` lors de chaque message entrant).

```python
supabase.table("tg_conversations").upsert(
    {
        "tg_chat_id": int(tg_chat_id),   # ← tg_chat_id
        "model_id": str(model_id),
        "tg_user_id": str(tg_user_id),
        "spender_id": str(spender_id),
        "display_name": display_name or "",
    },
    on_conflict="tg_chat_id,model_id",
).execute()
```

### Occurrence 2 — `crm_routes.py:1880` — UPSERT (dans POST /send-message, si conversation n'existe pas)

```python
sb.table("tg_conversations").upsert({
    "tg_chat_id": int(chat_id),          # ← tg_chat_id
    "model_id": str(model_id) if model_id else model_name,
}, on_conflict="tg_chat_id,model_id").execute()
```

### Occurrence 3 — `main.py:395` — UPDATE (dedup spenders, colonne LEGACY)

```python
supabase.table("tg_conversations").update(
    {"spender_id": canonical_id}
).eq("telegram_id", tid).is_("spender_id", "null").execute()
#         ^^^^^^^^^^^  ← utilise "telegram_id" (pas tg_chat_id!)
```

> **BUG POTENTIEL** : cette requête filtre sur `telegram_id` alors que la table utilise `tg_chat_id`. Probablement inopérant silencieusement (aucune row matchée si la colonne `telegram_id` n'existe pas).

### Occurrence 4 — `crm_routes.py:1440` — UPDATE (mark-read)

```python
sb.table("tg_conversations").update({"unread_count": 0}).eq("tg_chat_id", chat_id)
```

### Occurrence 5 — `job_worker.py:96` — UPDATE (link orphaned conversations, LEGACY)

```python
supabase.table("tg_conversations").update(
    {"spender_id": canonical["id"]}
).eq("telegram_id", tg_user_id).is_("spender_id", "null").execute()
#         ^^^^^^^^^^^  ← aussi "telegram_id" (potentiellement legacy/inopérant)
```

---

## B. POST `/send-message`

**Handler** : `handle_send_message()` — `crm_routes.py:1817`

### Cache invalidé : OUI

Lignes 1856-1861 :

```python
keys_to_purge = [k for k in _messages_cache if k.startswith(f"{chat_id}:")]
for k in keys_to_purge:
    _messages_cache.pop(k, None)
    _messages_cache_ts.pop(k, None)
```

### Save `tg_messages` : OUI

Lignes 1893-1901 :

```python
sb.table("tg_messages").upsert({
    "conversation_id": conv_id,
    "tg_message_id": tg_msg_id,
    "text": str(text),
    "direction": "out",
    "created_at": now_iso,
    "meta": {},           # ← meta vide, pas de media_url
}, on_conflict="conversation_id,tg_message_id").execute()
```

### Upsert `tg_conversations` : OUI (conditionnel)

Seulement si la conversation n'existe pas encore (lignes 1875-1889). Fait un upsert avec `tg_chat_id` + `model_id`. **Ne met PAS à jour `last_message_at`.**

---

## C. MEDIA HANDLING

### `media_url` persisté dans `tg_messages` : PARTIELLEMENT

- **POST `/send-message`** : `meta: {}` → `media_url` NON persisté (c'est du texte uniquement)
- **POST `/send-media`** (`crm_routes.py:2288`) : NE sauvegarde PAS dans `tg_messages` du tout. Il appelle `_record_sent_media()` (table `sent_medias`), pas d'upsert dans `tg_messages`.
- **GET `/messages`** (Telegram fallback) : Le background save (`_save_messages_bg`) persiste `media_url` dans `meta` JSONB si le download a réussi.

### Upload Supabase Storage : OUI

`_download_media_url()` (`crm_routes.py:302-355`) télécharge via `client.download_media()` puis upload vers Supabase Storage via `_upload_to_supabase_storage()`. Fallback local si Storage indisponible.

### Endpoint `/send-media` existe : OUI

`crm_routes.py:2288`, route enregistrée à `crm_routes.py:4013`.

### GET `/conversations/{chat_id}/messages` — `media_url` :

- **Source Supabase** : `media_url = meta.get("media_url")` (ligne 1640). Si URL est "dead" (contient `/static/media/`), re-download via Telegram (`_download_media_url`), max 3, 5s timeout chacun.
- **Source Telegram** : `_download_media_url(client, msg, sb=sb_media)` est appelé (ligne 1736), max 5 médias, 3s timeout chacun. Oui, `client.download_media()` est appelé.

---

## D. CACHE

| Paramètre | Valeur | Référence |
|---|---|---|
| TTL conversations | 30s | `crm_routes.py:1295` : `"ttl": 30.0` |
| TTL messages | 15s | `crm_routes.py:1300` : `_MESSAGES_CACHE_TTL = 15` |
| Sync throttle | 60s | `_SYNC_THROTTLE_TTL = 60` |
| Stale detection | 600s (10 min) | Si le dernier message a plus de 10 min, cache invalidé et sync Telegram forcé |

### Invalidation après send : PARTIELLE

- **`/send-message`** : OUI — `handle_send_message` purge le cache messages (lignes 1856-1861)

```python
keys_to_purge = [k for k in _messages_cache if k.startswith(f"{chat_id}:")]
_messages_cache.pop(k, None)
_messages_cache_ts.pop(k, None)
```

> **MAIS** : `/send-media`, `/send-photo`, `/send-video`, `/send-audio` **N'INVALIDENT PAS** le cache messages.

---

## E. FORMAT DES IDs

| Source | Champ | Type |
|---|---|---|
| Cache | Même format que la source originale | (Supabase ou Telegram) |
| Supabase | `m.get("tg_message_id") or m["id"]` (ligne 1646) | String (`tg_message_id`) ou UUID (fallback `id`) |
| Telegram | `msg.id` (ligne 1745) | Int (ID numérique natif) |

**Champ `source` retourné : NON** — Le champ `source` est loggé (`log.info`) mais n'est PAS inclus dans la réponse JSON.

---

## F. GET `/conversations`

**Handler** : `handle_conversations()` — `crm_routes.py:1321`

| Aspect | Valeur |
|---|---|
| Sources | **TELEGRAM UNIQUEMENT** — Appelle `client.get_dialogs()` directement via Telethon (ligne 1345). Pas de requête Supabase, pas de fallback DB. |
| Limite | **AUCUNE** — Retourne toutes les conversations de tous les clients connectés. Pas de `limit` explicite sur `get_dialogs()`. |
| Pagination | **NON** — Aucun paramètre `offset`/`limit`/`page` accepté. |
| Cache | **OUI** — TTL 30s, uniquement quand aucun filtre `model_id`/`model` n'est appliqué (ligne 1380). |
| Dédoublonnage | **OUI** — via `seen_pairs` sur `(entity_id, model_id)` (ligne 1358). |
