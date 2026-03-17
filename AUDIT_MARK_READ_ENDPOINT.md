# AUDIT — Préparation endpoint POST /mark-read

**Date** : 2026-03-17
**Fichier principal** : `crm_routes.py` (déployé sur Railway, **ABSENT du repo**)
**Fichiers satellites présents** : `crm_routes_send_video.py`, `crm_routes_session_generator.py`
**Service Railway** : `dadash-autofill-v2-production`

---

## CONSTAT CRITIQUE

> Le fichier `crm_routes.py` n'existe PAS dans ce repository.
> Il n'a **jamais** été commité (aucune trace dans l'historique git de `main` ni `master`).
> Il est déployé séparément sur Railway.

Les deux fichiers Python présents (`crm_routes_send_video.py`, `crm_routes_session_generator.py`) sont des **modules satellites** qui référencent des fonctions définies dans `crm_routes.py` sans les implémenter :
- `_check_crm_api_key(request)` — utilisé mais non défini ici
- `_get_telethon_client(model_id)` — utilisé mais non défini ici
- `routes` — objet RouteTableDef aiohttp, non défini ici
- `supabase` — client Supabase, non défini ici

**L'audit ci-dessous est basé sur ce qui est disponible dans le repo (code frontend + modules satellites).**

---

## 1. TELETHON `send_read_acknowledge` / `read_history`

### Résultat : ABSENT — Aucune utilisation trouvée

```
Grep "send_read_acknowledge|read_history" dans tout le codebase → 0 résultats
```

- Ni `send_read_acknowledge` ni `read_history` ne sont utilisés nulle part.
- Les seules opérations Telethon présentes sont :
  - `client.send_file(...)` — `crm_routes_send_video.py:228`
  - `client.send_code_request(...)` — `crm_routes_session_generator.py:52`
  - `client.sign_in(...)` — `crm_routes_session_generator.py:96`
  - `client.connect()` / `client.disconnect()` — session generator

**Conclusion** : `send_read_acknowledge` sera une première dans le codebase.

---

## 2. STRUCTURE DES CLIENTS TELETHON

### Ce qu'on sait (depuis les modules satellites)

Le client Telethon est obtenu via une **fonction utilitaire** définie dans `crm_routes.py` :

```python
# crm_routes_send_video.py:220
client = await _get_telethon_client(model_id)
```

- **Signature** : `async def _get_telethon_client(model_id) -> TelegramClient | None`
- **Paramètre** : `model_id` (string/UUID du modèle)
- **Retour** : un `TelegramClient` connecté, ou `None` si pas de session pour ce modèle

### Ce qu'on NE sait PAS (code dans `crm_routes.py` absent)

- La structure interne de stockage des clients (probablement un `dict` `_clients` ou similaire)
- Le mapping `model_id → session_string` (probablement via Supabase table `models`, colonne `session_string` ou `telethon_session`)
- Si les clients sont mis en cache (dict) ou recréés à chaque appel

### Recommandation pour `/mark-read`

Réutiliser exactement le même pattern :
```python
client = await _get_telethon_client(model_id)
if not client:
    return web.json_response({"success": False, "error": "No Telethon session"}, status=400)
```

---

## 3. AUTHENTIFICATION DES ROUTES

### Mécanisme : `_check_crm_api_key` (check inline, pas décorateur)

```python
# crm_routes_send_video.py:135-136
if not _check_crm_api_key(request):
    return web.json_response({"error": "Unauthorized"}, status=401)

# crm_routes_session_generator.py:30-31 (même pattern)
if not _check_crm_api_key(request):
    return web.json_response({"error": "Unauthorized"}, status=401)
```

- **Type** : Check inline en début de handler (PAS un décorateur `@_require_auth`)
- **Fonction** : `_check_crm_api_key(request)` — définie dans `crm_routes.py` (absent)
- **Mécanisme probable** : vérifie `request.headers.get("X-API-Key")` contre une clé env `CRM_API_KEY`
- **Côté frontend** : header envoyé via `"X-API-Key": key` (`index.html:31871`)

### Pour appliquer sur `/mark-read`

```python
async def handle_mark_read(request: web.Request) -> web.Response:
    if not _check_crm_api_key(request):
        return web.json_response({"error": "Unauthorized"}, status=401)
    # ...
```

---

## 4. PATTERN D'ENREGISTREMENT DES ROUTES

### Deux patterns coexistent

#### Pattern A : Décorateur `@routes` (utilisé dans les modules satellites)
```python
# crm_routes_send_video.py:132
@routes.post("/send-video")

# crm_routes_session_generator.py:27, 68, 120
@routes.post("/generate-session/start")
@routes.post("/generate-session/confirm")
@routes.get("/api/models/status")
```

#### Pattern B : Enregistrement explicite (commenté, pour intégration dans `crm_routes.py`)
```python
# crm_routes_session_generator.py:176-178
# app.router.add_post("/generate-session/start",   handle_generate_session_start)
# app.router.add_post("/generate-session/confirm", handle_generate_session_confirm)
# app.router.add_get("/api/models/status",          get_models_status)

# crm_routes_send_video.py:20
#     app.router.add_post("/send-video", handle_send_video)
```

### Routes POST existantes (exemples)
- `POST /send-video` — envoi vidéo Telethon
- `POST /send-message` — envoi message texte (dans `crm_routes.py`)
- `POST /generate-session/start` — démarrage génération session
- `POST /generate-session/confirm` — confirmation code session

### Pour `/mark-read`

```python
# Option A (décorateur) :
@routes.post("/mark-read")
async def handle_mark_read(request): ...

# Option B (enregistrement explicite dans setup_crm_routes) :
app.router.add_post("/mark-read", handle_mark_read)
```

---

## 5. GESTION DES ERREURS

### Pattern standard : try/except générique

```python
# crm_routes_send_video.py:254-259
except Exception as exc:
    log.error(f"[SEND_VIDEO] Error: {exc}", exc_info=True)
    return web.json_response(
        {"success": False, "error": str(exc)},
        status=500,
    )
```

```python
# crm_routes_session_generator.py:63-65
except Exception as exc:
    log.error(f"[SESSION_GEN] Start error: {exc}")
    return web.json_response({"success": False, "error": str(exc)}, status=500)
```

### Exceptions Telethon spécifiques catchées

**AUCUNE** — Le codebase ne catche aucune exception Telethon spécifique :
- Pas de `PeerIdInvalidError`
- Pas de `FloodWaitError`
- Pas de `ChatWriteForbiddenError`
- Pas de `UserNotParticipantError`

Tout passe par le catch-all `Exception`.

### Recommandation pour `/mark-read`

Suivre le même pattern (catch-all) pour cohérence, mais considérer l'ajout de :
```python
from telethon.errors import PeerIdInvalidError, FloodWaitError

try:
    await client.send_read_acknowledge(...)
except PeerIdInvalidError:
    return web.json_response({"success": False, "error": "Invalid peer/chat_id"}, status=400)
except FloodWaitError as e:
    return web.json_response({"success": False, "error": f"Flood wait {e.seconds}s"}, status=429)
except Exception as exc:
    log.error(f"[MARK_READ] Error: {exc}", exc_info=True)
    return web.json_response({"success": False, "error": str(exc)}, status=500)
```

---

## 6. CORS

### Configuration côté frontend (CSP)

```html
<!-- index.html:132 -->
connect-src 'self'
  https://lkrzjwfwhiimpnsyeuxi.supabase.co
  https://*.supabase.co
  wss://lkrzjwfwhiimpnsyeuxi.supabase.co
  wss://*.supabase.co
  https://dadash-autofill-v2-production.up.railway.app
  wss://dadash-autofill-v2-production.up.railway.app
  https://api.anthropic.com
  https://api.exchangerate-api.com
  https://cdnjs.cloudflare.com;
```

Le frontend autorise déjà les requêtes vers `https://dadash-autofill-v2-production.up.railway.app` (CSP `connect-src`).

### Configuration côté serveur (CORS)

La config CORS serveur est dans `crm_routes.py` (absent du repo). Cependant :

- Le frontend détecte les erreurs CORS (`index.html:31900`) :
  ```javascript
  const isCors = networkErr.message && (
    networkErr.message.toLowerCase().includes("cors") ||
    networkErr.message.toLowerCase().includes("blocked") ||
    networkErr.message.toLowerCase().includes("failed to fetch")
  );
  ```

- Les routes POST existantes (`/send-message`, `/send-video`) fonctionnent déjà depuis le frontend → le CORS serveur autorise donc POST + les headers `Content-Type` et `X-API-Key`.

### Le POST `/mark-read` sera-t-il autorisé ?

**OUI** — Même domaine (`dadash-autofill-v2-production.up.railway.app`), même méthode POST, mêmes headers que les routes existantes. Aucune modification CORS nécessaire.

---

## RÉSUMÉ EXÉCUTIF

| # | Point | Statut |
|---|-------|--------|
| 1 | `send_read_acknowledge` | **Jamais utilisé** — première implémentation |
| 2 | Structure clients Telethon | Via `_get_telethon_client(model_id)` — détails dans `crm_routes.py` (absent) |
| 3 | Auth | `_check_crm_api_key(request)` — check inline, header `X-API-Key` |
| 4 | Routes | `@routes.post(...)` ou `app.router.add_post(...)` — POST déjà utilisé |
| 5 | Erreurs | Catch-all `except Exception` — pas d'exceptions Telethon spécifiques |
| 6 | CORS | OK — POST déjà autorisé vers Railway |

### BLOQUANT POUR L'IMPLÉMENTATION

Le fichier `crm_routes.py` **n'est pas dans ce repo**. Pour implémenter `/mark-read`, il faut soit :
1. **Obtenir accès au repo/service Railway** contenant `crm_routes.py`
2. **Créer un module satellite** `crm_routes_mark_read.py` (comme `crm_routes_send_video.py`) à intégrer manuellement dans le service Railway
3. **Ajouter `crm_routes.py` au repo** pour centraliser le développement

---

*Audit réalisé sur le repository `dadash-crm` — aucun fichier modifié.*
