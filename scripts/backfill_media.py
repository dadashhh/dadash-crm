"""
Backfill media URLs for existing tg_messages.
==============================================

Uses Telethon (userbot) to access Telegram message history,
download media files, upload to Supabase Storage, and update
tg_messages.meta with permanent public URLs.

Usage:
    python scripts/backfill_media.py                    # all conversations, last 7 days
    python scripts/backfill_media.py --all              # all conversations, all time
    python scripts/backfill_media.py --chat-id=12345    # single conversation
    python scripts/backfill_media.py --limit=50         # max 50 conversations
    python scripts/backfill_media.py --dry-run          # preview without writing

Required env vars:
    SUPABASE_URL          - Supabase project URL
    SUPABASE_SERVICE_KEY  - Supabase service_role key (full access)

The script reads Telethon sessions from the bot_sessions table.
"""

import asyncio
import hashlib
import logging
import mimetypes
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_media")

# ── Supabase ──
try:
    from supabase import create_client
except ImportError:
    log.error("pip install supabase-py required")
    sys.exit(1)

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.types import (
        MessageMediaDocument,
        MessageMediaPhoto,
    )
except ImportError:
    log.error("pip install telethon required")
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
STORAGE_BUCKET = "message-media"  # Supabase Storage bucket name

if not SUPABASE_URL or not SUPABASE_KEY:
    log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── CLI args ──
args = sys.argv[1:]
DRY_RUN = "--dry-run" in args
ALL_TIME = "--all" in args
LIMIT = 200
CHAT_ID = None

for a in args:
    if a.startswith("--limit="):
        LIMIT = int(a.split("=")[1])
    if a.startswith("--chat-id="):
        CHAT_ID = a.split("=")[1]


def detect_media_type(message) -> tuple[str | None, str | None]:
    """Detect media type and file extension from a Telethon message."""
    media = message.media
    if not media:
        return None, None

    if isinstance(media, MessageMediaPhoto):
        return "photo", ".jpg"

    if isinstance(media, MessageMediaDocument):
        doc = media.document
        if not doc:
            return None, None

        mime = doc.mime_type or ""

        # Check attributes for type hints
        for attr in doc.attributes:
            cls_name = type(attr).__name__
            if cls_name == "DocumentAttributeVideo":
                return "video", mimetypes.guess_extension(mime) or ".mp4"
            if cls_name == "DocumentAttributeAudio":
                if getattr(attr, "voice", False):
                    return "voice", ".ogg"
                return "audio", mimetypes.guess_extension(mime) or ".mp3"
            if cls_name == "DocumentAttributeSticker":
                return "sticker", ".webp"
            if cls_name == "DocumentAttributeAnimated":
                return "animation", ".tgs"

        # Fallback on MIME type
        if mime.startswith("image/"):
            return "photo", mimetypes.guess_extension(mime) or ".jpg"
        if mime.startswith("video/"):
            return "video", mimetypes.guess_extension(mime) or ".mp4"
        if mime.startswith("audio/"):
            return "audio", mimetypes.guess_extension(mime) or ".mp3"

        return "document", mimetypes.guess_extension(mime) or ".bin"

    return None, None


async def upload_to_storage(file_path: str, storage_key: str) -> str | None:
    """Upload a local file to Supabase Storage and return the public URL."""
    try:
        with open(file_path, "rb") as f:
            data = f.read()

        # Detect content type
        mime, _ = mimetypes.guess_type(file_path)
        content_type = mime or "application/octet-stream"

        sb.storage.from_(STORAGE_BUCKET).upload(
            storage_key,
            data,
            {"content-type": content_type},
        )

        # Get public URL
        res = sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_key)
        return res
    except Exception as e:
        # If file already exists, just get its public URL
        if "Duplicate" in str(e) or "already exists" in str(e):
            return sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_key)
        log.error(f"Upload failed: {e}")
        return None


async def backfill_conversation(
    client: TelegramClient,
    conv_id: str,
    chat_id: str,
    model_name: str,
) -> dict:
    """Backfill media for a single conversation. Returns stats."""
    stats = {"checked": 0, "updated": 0, "skipped": 0, "errors": 0}

    # Get existing messages from DB that need media
    resp = (
        sb.table("tg_messages")
        .select("id, tg_message_id, meta")
        .eq("conversation_id", conv_id)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    db_messages = resp.data or []

    if not db_messages:
        return stats

    # Build lookup: tg_message_id → db row
    db_lookup: dict[str, dict] = {}
    for m in db_messages:
        mid = str(m.get("tg_message_id", ""))
        if mid:
            db_lookup[mid] = m

    # Filter to messages that need media (no media_url in meta)
    needs_media = {}
    for mid, m in db_lookup.items():
        meta = m.get("meta") or {}
        if meta.get("media_url"):
            continue  # Already has URL
        needs_media[mid] = m

    if not needs_media:
        log.info(f"  [{chat_id}] All messages already have media URLs")
        return stats

    log.info(f"  [{chat_id}] {len(needs_media)} messages need media check")

    # Fetch message history from Telegram via Telethon
    try:
        entity = await client.get_entity(int(chat_id))
    except Exception as e:
        log.error(f"  [{chat_id}] Cannot get entity: {e}")
        stats["errors"] = len(needs_media)
        return stats

    async for tg_msg in client.iter_messages(entity, limit=500):
        tg_mid = str(tg_msg.id)
        stats["checked"] += 1

        if tg_mid not in needs_media:
            continue

        media_type, ext = detect_media_type(tg_msg)
        if not media_type:
            continue

        db_row = needs_media[tg_mid]
        db_id = db_row["id"]
        meta = dict(db_row.get("meta") or {})

        if DRY_RUN:
            log.info(f"  [DRY-RUN] msg {tg_mid}: {media_type} — would download + upload")
            stats["updated"] += 1
            continue

        # Download media to temp file
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp_path = tmp.name

            downloaded = await client.download_media(tg_msg, file=tmp_path)
            if not downloaded or not os.path.exists(tmp_path):
                stats["skipped"] += 1
                continue

            file_size = os.path.getsize(tmp_path)
            if file_size == 0:
                stats["skipped"] += 1
                continue

            # Generate unique storage key
            file_hash = hashlib.md5(f"{chat_id}_{tg_mid}".encode()).hexdigest()[:12]
            storage_key = f"{chat_id}/{file_hash}{ext}"

            # Upload to Supabase Storage
            public_url = await upload_to_storage(tmp_path, storage_key)
            if not public_url:
                stats["errors"] += 1
                continue

            # Update meta in DB
            meta["media_type"] = media_type
            meta["media_url"] = public_url
            meta["media_size"] = file_size
            meta["backfilled_at"] = datetime.now(timezone.utc).isoformat()

            sb.table("tg_messages").update({"meta": meta}).eq("id", db_id).execute()

            stats["updated"] += 1
            log.info(f"  [{chat_id}] msg {tg_mid}: {media_type} ({file_size // 1024}KB) → uploaded")

        except Exception as e:
            log.error(f"  [{chat_id}] msg {tg_mid}: error: {e}")
            stats["errors"] += 1
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    return stats


async def main():
    log.info("=" * 60)
    log.info("BACKFILL MEDIA — Starting")
    log.info(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    log.info(f"  Scope: {'all time' if ALL_TIME else 'last 7 days'}")
    log.info(f"  Limit: {LIMIT} conversations")
    if CHAT_ID:
        log.info(f"  Chat ID filter: {CHAT_ID}")
    log.info("=" * 60)

    # 1. Load bot sessions (Telethon)
    sess_resp = sb.table("bot_sessions").select("*").eq("status", "active").execute()
    sessions = sess_resp.data or []

    if not sessions:
        log.error("No active bot_sessions found in Supabase")
        return

    log.info(f"Found {len(sessions)} active bot session(s)")

    # 2. Load conversations to process
    query = sb.table("tg_conversations").select("id, tg_chat_id, model_id, display_name")

    if CHAT_ID:
        query = query.eq("tg_chat_id", CHAT_ID)
    else:
        query = query.not_.is_("tg_chat_id", "null")
        if not ALL_TIME:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            query = query.gte("last_message_at", cutoff)

    query = query.order("last_message_at", desc=True).limit(LIMIT)
    conv_resp = query.execute()
    conversations = conv_resp.data or []

    if not conversations:
        log.info("No conversations to process")
        return

    log.info(f"Processing {len(conversations)} conversation(s)")

    # 3. Build Telethon clients by model
    clients: dict[str, TelegramClient] = {}
    default_client: TelegramClient | None = None

    for sess in sessions:
        api_id = sess.get("api_id")
        api_hash = sess.get("api_hash")
        session_str = sess.get("session_string")
        model_id = sess.get("model_id")

        if not api_id or not api_hash or not session_str:
            log.warning(f"Session {sess.get('id')} missing credentials, skipping")
            continue

        try:
            client = TelegramClient(
                StringSession(session_str),
                int(api_id),
                api_hash,
            )
            await client.connect()

            if not await client.is_user_authorized():
                log.warning(f"Session {sess.get('id')} not authorized, skipping")
                await client.disconnect()
                continue

            model_name = sess.get("model_name", "unknown")
            log.info(f"  Connected: {model_name} (model_id={model_id})")

            if model_id:
                clients[str(model_id)] = client
            if default_client is None:
                default_client = client

        except Exception as e:
            log.error(f"Session {sess.get('id')} connection failed: {e}")

    if not clients and not default_client:
        log.error("No Telethon clients connected — cannot proceed")
        return

    # 4. Ensure storage bucket exists
    if not DRY_RUN:
        try:
            sb.storage.get_bucket(STORAGE_BUCKET)
        except Exception:
            try:
                sb.storage.create_bucket(STORAGE_BUCKET, {"public": True})
                log.info(f"Created storage bucket: {STORAGE_BUCKET}")
            except Exception as e:
                if "already exists" not in str(e).lower():
                    log.error(f"Cannot create storage bucket: {e}")
                    return

    # 5. Process conversations
    totals = {"checked": 0, "updated": 0, "skipped": 0, "errors": 0}

    for i, conv in enumerate(conversations):
        conv_id = conv["id"]
        chat_id = conv["tg_chat_id"]
        model_id = conv.get("model_id")
        name = conv.get("display_name") or chat_id

        log.info(f"[{i + 1}/{len(conversations)}] {name} (chat_id={chat_id})")

        # Pick the right Telethon client for this model
        client = clients.get(str(model_id)) if model_id else None
        if not client:
            client = default_client
        if not client:
            log.warning(f"  No client for model_id={model_id}, skipping")
            continue

        try:
            stats = await backfill_conversation(
                client, conv_id, chat_id, name
            )
            for k in totals:
                totals[k] += stats[k]
        except Exception as e:
            log.error(f"  [{chat_id}] Fatal error: {e}")
            totals["errors"] += 1

    # 6. Cleanup
    for client in set(clients.values()):
        try:
            await client.disconnect()
        except Exception:
            pass
    if default_client and default_client not in clients.values():
        try:
            await default_client.disconnect()
        except Exception:
            pass

    # 7. Summary
    log.info("=" * 60)
    log.info("BACKFILL MEDIA — Done")
    log.info(f"  Messages checked:  {totals['checked']}")
    log.info(f"  Media uploaded:    {totals['updated']}")
    log.info(f"  Skipped (no file): {totals['skipped']}")
    log.info(f"  Errors:            {totals['errors']}")
    log.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
