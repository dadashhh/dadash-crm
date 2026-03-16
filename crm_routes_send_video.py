"""
Route backend : /send-video
============================
Service Railway : dadash-autofill-v2-production

Envoie une vidéo via Telethon (userbot) au spender sur Telegram.
- Télécharge la vidéo depuis Supabase Storage
- Détecte le format (WebM, MOV, etc.)
- Convertit en MP4 H.264 via FFmpeg si nécessaire
- Extrait durée/dimensions via FFprobe
- Envoie en mode vidéo inline (pas document) via Telethon

Dépendances requises:
    pip install telethon aiohttp

Imports à ajouter en haut de crm_routes.py:
    from crm_routes_send_video import handle_send_video

Route à enregistrer dans setup_crm_routes:
    app.router.add_post("/send-video", handle_send_video)
"""

import json
import logging
import os
import subprocess
import tempfile

import aiohttp
from aiohttp import web
from telethon.tl.types import DocumentAttributeVideo

log = logging.getLogger(__name__)

# Extensions nécessitant une conversion vers MP4 H.264
CONVERTIBLE_EXTENSIONS = {'.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.3gp'}


def get_video_info(file_path: str) -> tuple[int, int, int]:
    """Extraire durée et dimensions avec ffprobe.

    Returns:
        (duration_seconds, width, height)
    """
    try:
        result = subprocess.run(
            [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_streams',
                '-show_format',
                file_path,
            ],
            capture_output=True,
            timeout=10,
        )

        if result.returncode == 0:
            info = json.loads(result.stdout)

            duration = 0
            width = 1280
            height = 720

            # Durée depuis format
            if 'format' in info and 'duration' in info['format']:
                duration = int(float(info['format']['duration']))

            # Dimensions depuis le premier stream vidéo
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'video':
                    width = stream.get('width', 1280)
                    height = stream.get('height', 720)
                    if not duration and 'duration' in stream:
                        duration = int(float(stream['duration']))
                    break

            return duration, width, height

    except Exception as e:
        log.warning(f"[SEND_VIDEO] ffprobe error: {e}")

    return 0, 1280, 720  # Defaults


def convert_to_mp4(input_path: str, output_path: str) -> bool:
    """Convertit un fichier vidéo en MP4 H.264 + AAC via FFmpeg.

    Returns:
        True si conversion réussie, False sinon.
    """
    try:
        result = subprocess.run(
            [
                'ffmpeg',
                '-i', input_path,
                '-c:v', 'libx264',
                '-crf', '23',
                '-preset', 'fast',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',  # Streaming Telegram
                '-y',
                output_path,
            ],
            capture_output=True,
            timeout=300,  # 5 min max
        )

        if result.returncode == 0:
            original_size = os.path.getsize(input_path)
            new_size = os.path.getsize(output_path)
            log.info(
                f"[SEND_VIDEO] Converti MP4: "
                f"{original_size / 1024 / 1024:.1f}MB -> {new_size / 1024 / 1024:.1f}MB"
            )
            return True
        else:
            stderr = result.stderr.decode(errors='replace')[:500]
            log.error(f"[SEND_VIDEO] FFmpeg error: {stderr}")
            return False

    except subprocess.TimeoutExpired:
        log.error("[SEND_VIDEO] FFmpeg timeout (5 min)")
        return False
    except FileNotFoundError:
        log.error("[SEND_VIDEO] FFmpeg non installe")
        return False


@routes.post("/send-video")
async def handle_send_video(request: web.Request) -> web.Response:
    """Envoie une vidéo via Telethon au spender Telegram."""
    if not _check_crm_api_key(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    body = await request.json()
    chat_id = body.get("chat_id")
    video_url = body.get("video_url")
    caption = body.get("caption", "")
    model_id = body.get("model_id")
    req_width = body.get("width")
    req_height = body.get("height")
    req_duration = body.get("duration")

    if not chat_id or not video_url:
        return web.json_response(
            {"success": False, "error": "chat_id and video_url required"},
            status=400,
        )

    temp_file_path = None
    converted_path = None

    try:
        # ── 1. Extraire filename et extension depuis l'URL ──
        filename = video_url.split('/')[-1].split('?')[0]
        _, ext = os.path.splitext(filename)
        ext = ext.lower()
        log.info(f"[SEND_VIDEO] URL: ...{filename} | ext={ext} | chat_id={chat_id}")

        # ── 2. Télécharger la vidéo en fichier temporaire ──
        async with aiohttp.ClientSession() as session:
            async with session.get(video_url, timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status != 200:
                    log.error(f"[SEND_VIDEO] Download failed: HTTP {resp.status}")
                    return web.json_response(
                        {"success": False, "error": f"Download failed: HTTP {resp.status}"},
                        status=502,
                    )

                suffix = ext if ext else '.mp4'
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    temp_file_path = tmp.name
                    while True:
                        chunk = await resp.content.read(1024 * 1024)  # 1MB chunks
                        if not chunk:
                            break
                        tmp.write(chunk)

        file_size = os.path.getsize(temp_file_path)
        log.info(f"[SEND_VIDEO] Downloaded: {file_size / 1024 / 1024:.1f}MB -> {temp_file_path}")

        # ── 3. Conversion si format non-MP4 ──
        if ext in CONVERTIBLE_EXTENSIONS:
            log.info(f"[SEND_VIDEO] Format {ext} detecte — conversion MP4 H.264...")

            converted_path = temp_file_path + '_converted.mp4'

            if convert_to_mp4(temp_file_path, converted_path):
                # Conversion réussie : utiliser le fichier converti
                os.remove(temp_file_path)
                temp_file_path = converted_path
                converted_path = None  # Ne pas supprimer en cleanup
                filename = os.path.splitext(filename)[0] + '.mp4'
                ext = '.mp4'
            else:
                # Conversion échouée : envoyer l'original (sera un document)
                log.warning("[SEND_VIDEO] Conversion echouee, envoi du fichier original")
                if converted_path and os.path.exists(converted_path):
                    os.remove(converted_path)
                    converted_path = None

        elif ext and ext not in ('.mp4',):
            # Extension inconnue non convertible, forcer .mp4 dans le nom
            filename = os.path.splitext(filename)[0] + '.mp4'

        # ── 4. Extraire métadonnées vidéo via FFprobe ──
        probe_duration, probe_width, probe_height = get_video_info(temp_file_path)

        # Préférer les valeurs FFprobe, fallback sur valeurs du frontend
        duration = probe_duration or (int(req_duration) if req_duration else 0)
        width = probe_width if probe_width != 1280 else (int(req_width) if req_width else 1280)
        height = probe_height if probe_height != 720 else (int(req_height) if req_height else 720)

        log.info(f"[SEND_VIDEO] Video info: {duration}s, {width}x{height}")

        # ── 5. Récupérer le client Telethon pour ce modèle ──
        client = await _get_telethon_client(model_id)
        if not client:
            return web.json_response(
                {"success": False, "error": "No Telethon session for this model"},
                status=400,
            )

        # ── 6. Envoyer via Telethon en mode vidéo inline ──
        result = await client.send_file(
            int(chat_id),
            file=temp_file_path,
            caption=caption,
            supports_streaming=True,       # Lecture sans téléchargement complet
            force_document=False,           # Mode vidéo, PAS document
            attributes=[
                DocumentAttributeVideo(
                    duration=duration,
                    w=width,
                    h=height,
                    supports_streaming=True,
                )
            ],
        )

        log.info(
            f"[SEND_VIDEO] Envoye: chat_id={chat_id} | "
            f"msg_id={result.id} | {duration}s {width}x{height}"
        )

        return web.json_response({
            "success": True,
            "message_id": result.id,
        })

    except Exception as exc:
        log.error(f"[SEND_VIDEO] Error: {exc}", exc_info=True)
        return web.json_response(
            {"success": False, "error": str(exc)},
            status=500,
        )

    finally:
        # Cleanup fichiers temporaires
        for path in (temp_file_path, converted_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
