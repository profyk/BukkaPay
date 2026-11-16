"""Document & image uploads → Supabase Storage (private `documents` bucket).

Returns a private reference (``storage://documents/<path>``), never a public
URL; admins view files through short-lived signed URLs
(``GET /api/admin/files/signed-url``). Without Supabase configured,
development falls back to an inline data URI (clearly labelled); production
refuses rather than silently not storing KYC/KYB evidence.
"""

import base64
import binascii
import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.errors import ApiError
from app.integrations import supabase_client
from app.schemas.notification import UploadRequest, UploadResponse

router = APIRouter(prefix="/api", tags=["upload"])

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}
MAX_BYTES = 10 * 1024 * 1024
BUCKET = "documents"


@router.post("/upload")
async def upload(body: UploadRequest, user_id=Depends(get_current_user_id)) -> UploadResponse:
    if not body.base64 or not body.mime_type:
        raise ApiError("base64 and mimeType are required")
    if body.mime_type not in ALLOWED:
        raise ApiError("Only JPEG, PNG, WebP images and PDF documents are accepted")
    raw = body.base64.split(",", 1)[1] if body.base64.startswith("data:") else body.base64
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ApiError("File is not valid base64") from e
    if len(data) > MAX_BYTES:
        raise ApiError("Files must be 10 MB or smaller")

    purpose = (body.purpose or "other").lower()
    if purpose not in ("kyc", "kyb", "avatar", "invoice", "other"):
        purpose = "other"
    if supabase_client.is_storage_configured():
        path = f"{purpose}/{user_id}/{uuid.uuid4().hex}.{ALLOWED[body.mime_type]}"
        await supabase_client.upload_to_storage(BUCKET, path, data, content_type=body.mime_type)
        url = f"storage://{BUCKET}/{path}"
    elif not get_settings().is_production:
        url = f"data:{body.mime_type};base64,{raw}"  # development only — not persisted to storage
    else:
        raise ApiError("File storage is not configured", status_code=503)
    return UploadResponse.model_validate({"url": url, "filename": body.filename or "file", "mimeType": body.mime_type})
