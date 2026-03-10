"""
Routes backend pour le Générateur de Session Telegram
======================================================
À intégrer dans crm_routes.py du service Railway (dadash-autofill-v2-production).

Dépendances requises:
    pip install telethon

Imports à ajouter en haut de crm_routes.py:
    from telethon.sessions import StringSession, MemorySession
"""

import logging
from aiohttp import web
from telethon import TelegramClient
from telethon.sessions import StringSession, MemorySession

log = logging.getLogger(__name__)


@routes.post("/generate-session/start")
async def handle_generate_session_start(request: web.Request) -> web.Response:
    """Démarre génération session — envoie code Telegram"""
    if not _check_crm_api_key(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    body = await request.json()
    api_id = body.get("api_id")
    api_hash = body.get("api_hash")
    phone = body.get("phone")

    if not api_id or not api_hash or not phone:
        return web.json_response({"success": False, "error": "Missing parameters"}, status=400)

    try:
        log.info(f"[SESSION_GEN] Starting for {phone}")

        temp_client = TelegramClient(
            MemorySession(),
            int(api_id),
            api_hash
        )

        await temp_client.connect()

        result = await temp_client.send_code_request(phone)

        await temp_client.disconnect()

        log.info(f"[SESSION_GEN] Code sent to {phone}")

        return web.json_response({
            "success": True,
            "phone_code_hash": result.phone_code_hash
        })

    except Exception as exc:
        log.error(f"[SESSION_GEN] Start error: {exc}")
        return web.json_response({"success": False, "error": str(exc)}, status=500)


@routes.post("/generate-session/confirm")
async def handle_generate_session_confirm(request: web.Request) -> web.Response:
    """Confirme code et génère session string"""
    if not _check_crm_api_key(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    body = await request.json()
    api_id = body.get("api_id")
    api_hash = body.get("api_hash")
    phone = body.get("phone")
    code = body.get("code")
    phone_code_hash = body.get("phone_code_hash")

    if not all([api_id, api_hash, phone, code, phone_code_hash]):
        return web.json_response({"success": False, "error": "Missing parameters"}, status=400)

    try:
        log.info(f"[SESSION_GEN] Confirming code for {phone}")

        string_session = StringSession()
        temp_client = TelegramClient(
            string_session,
            int(api_id),
            api_hash
        )

        await temp_client.connect()

        await temp_client.sign_in(
            phone=phone,
            code=code,
            phone_code_hash=phone_code_hash
        )

        session_string = string_session.save()

        await temp_client.disconnect()

        log.info(f"[SESSION_GEN] Session generated for {phone}")

        return web.json_response({
            "success": True,
            "session_string": session_string
        })

    except Exception as exc:
        log.error(f"[SESSION_GEN] Confirm error: {exc}")
        return web.json_response({"success": False, "error": str(exc)}, status=500)


# ── Enregistrement routes (à ajouter dans setup_crm_routes) ────────────────
# app.router.add_post("/generate-session/start",   handle_generate_session_start)
# app.router.add_post("/generate-session/confirm", handle_generate_session_confirm)
