from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.webauthn import (
    AuthenticationOptionsRequest,
    AuthenticationVerifyResponse,
    SuccessResponse,
    WebauthnCredentialResponse,
)
from app.services import webauthn_service as svc

router = APIRouter(prefix="/api/webauthn", tags=["webauthn"])


@router.post("/register/options")
async def register_options(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    return await svc.generate_registration_options_for_user(db, user_id)


@router.post("/register/verify")
async def register_verify(
    credential: dict = Body(...), user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> SuccessResponse:
    await svc.verify_registration(db, user_id, credential)
    return SuccessResponse.model_validate({"success": True, "message": "Biometric credential registered successfully"})


@router.post("/authenticate/options")
async def authenticate_options(body: AuthenticationOptionsRequest, db: AsyncSession = Depends(get_db)) -> dict:
    return await svc.generate_authentication_options_for_email(db, body.email)


@router.post("/authenticate/verify")
async def authenticate_verify(body: dict = Body(...), db: AsyncSession = Depends(get_db)) -> AuthenticationVerifyResponse:
    response = body.get("response")
    user_id_str = body.get("userId")
    if not user_id_str:
        raise ApiError("User ID is required")
    token, user = await svc.verify_authentication(db, response, user_id_str)
    return AuthenticationVerifyResponse.model_validate({"success": True, "token": token, "user": user})


@router.get("/credentials")
async def list_credentials(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[WebauthnCredentialResponse]:
    credentials = await svc.list_credentials(db, user_id)
    return [WebauthnCredentialResponse.model_validate(c) for c in credentials]


@router.delete("/credentials/{credential_id}")
async def delete_credential(
    credential_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    await svc.delete_credential(db, user_id, credential_id)
    return {"success": True}


@router.post("/disable")
async def disable(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    await svc.disable_webauthn(db, user_id)
    return {"success": True}
