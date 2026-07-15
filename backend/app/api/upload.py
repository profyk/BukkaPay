"""File upload — currently a stub matching the Node behavior exactly: it
just wraps the client-supplied base64 payload in a data: URI and hands it
back. No real object storage/CDN exists in this codebase yet.
"""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.schemas.notification import UploadRequest, UploadResponse

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload(body: UploadRequest, user_id=Depends(get_current_user_id)) -> UploadResponse:
    if not body.base64 or not body.mime_type:
        raise ApiError("base64 and mimeType are required")
    data_uri = f"data:{body.mime_type};base64,{body.base64}"
    return UploadResponse.model_validate({
        "url": data_uri, "filename": body.filename or "file", "mimeType": body.mime_type,
    })
