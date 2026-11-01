from __future__ import annotations

from typing import Any

from app.core.config import get_settings

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - optional, dependency not always installed
    Client = Any  # type: ignore[misc, assignment]
    create_client = None  # type: ignore[assignment]


def get_supabase_client() -> Any | None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    if create_client is None:
        return None
    return create_client(settings.supabase_url, settings.supabase_anon_key)


async def upload_to_storage(bucket_name: str, object_name: str, file_bytes: bytes, *, content_type: str = "application/octet-stream") -> str:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase credentials are not configured")

    storage = client.storage.from_(bucket_name)
    result = storage.upload(object_name, file_bytes, file_options={"content-type": content_type})
    if isinstance(result, dict) and "Key" in result:
        return str(result["Key"])
    return object_name
