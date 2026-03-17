"""
Route backend : /mark-read
============================
Service Railway : dadash-autofill-v2-production

Marque les messages Telegram comme lus via Telethon (send_read_acknowledge).
Appelé par le frontend quand un chatter ouvre une conversation dans le CRM.

Dépendances requises:
    pip install telethon

Imports à ajouter en haut de crm_routes.py:
    from crm_routes_mark_read import handle_mark_read

Route à enregistrer dans setup_crm_routes:
    app.router.add_post("/mark-read", handle_mark_read)
"""

import asyncio
import logging

from aiohttp import web

log = logging.getLogger(__name__)


@routes.post("/mark-read")
async def handle_mark_read(request: web.Request) -> web.Response:
    """Marque les messages comme lus dans Telegram via Telethon."""
    if not _check_crm_api_key(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    chat_id = body.get("chat_id")
    model_id = body.get("model_id")

    if not chat_id:
        return web.json_response(
            {"success": False, "error": "chat_id required"}, status=400
        )

    try:
        chat_id_int = int(chat_id)
    except (ValueError, TypeError):
        return web.json_response(
            {"success": False, "error": "chat_id must be numeric"}, status=400
        )

    # ── 1. Essayer avec le client du model_id demandé ──
    if model_id:
        client = await _get_telethon_client(model_id)
        if client and client.is_connected():
            try:
                await asyncio.wait_for(
                    client.send_read_acknowledge(chat_id_int),
                    timeout=10,
                )
                log.info(f"[MARK-READ] OK chat_id={chat_id_int} model_id={model_id}")
                return web.json_response({"success": True, "chat_id": chat_id_int})
            except Exception as e:
                log.warning(f"[MARK-READ] Failed with target client: {e}")

    # ── 2. Fallback : essayer tous les clients connectés ──
    for model_name, c in _clients.items():
        if not c.is_connected():
            continue
        try:
            await asyncio.wait_for(
                c.send_read_acknowledge(chat_id_int),
                timeout=10,
            )
            log.info(f"[MARK-READ] OK chat_id={chat_id_int} via {model_name}")
            return web.json_response(
                {"success": True, "chat_id": chat_id_int, "model": model_name}
            )
        except Exception as e:
            log.warning(f"[MARK-READ] {model_name} failed: {e}")
            continue

    return web.json_response(
        {"success": False, "error": "No client could mark as read"}, status=404
    )
