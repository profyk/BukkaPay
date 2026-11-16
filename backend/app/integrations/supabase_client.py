from __future__ import annotations

from typing import Any

from app.core.config import get_settings

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover - optional, dependency not always installed
    Client = Any  # type: ignore[misc, assignment]
    create_client = None  # type: ignore[assignment]


def get_supabase_client() -> Any | None:
    """Server-side client. Storage writes and signed URLs use the service
    role key (server only, never shipped to an app)."""
    settings = get_settings()
    key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not key or create_client is None:
        return None
    return create_client(settings.supabase_url, key)


def is_storage_configured() -> bool:
    settings = get_settings()
    return bool(settings.supabase_url and settings.supabase_service_role_key and create_client is not None)


async def signed_url(reference: str, *, expires_in: int = 600) -> str:
    """storage://<bucket>/<path> → short-lived signed URL."""
    if not reference.startswith("storage://"):
        return reference
    bucket, _, path = reference[len("storage://"):].partition("/")
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase credentials are not configured")
    result = client.storage.from_(bucket).create_signed_url(path, expires_in)
    return result.get("signedURL") or result.get("signedUrl") or result["signed_url"]


async def upload_to_storage(bucket_name: str, object_name: str, file_bytes: bytes, *, content_type: str = "application/octet-stream") -> str:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase credentials are not configured")

    storage = client.storage.from_(bucket_name)
    result = storage.upload(object_name, file_bytes, file_options={"content-type": content_type})
    if isinstance(result, dict) and "Key" in result:
        return str(result["Key"])
    return object_name
