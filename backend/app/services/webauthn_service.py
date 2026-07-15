"""WebAuthn (passkey) registration + authentication — port of the
@simplewebauthn/server flows in routes.ts. The Node version kept the
in-flight registration/authentication challenge in a process-local
`Map<userId, {challenge, expiresAt}>`; that doesn't work with multiple API
worker processes, so it moves to Redis here (same read-through-cache style
as app/core/session.py), keyed by user id with a 5-minute TTL matching the
original.
"""

import base64
import json
import uuid

import webauthn
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.redis import get_redis
from app.models.user import User
from app.models.webauthn import WebauthnCredential
from app.services import auth_service

CHALLENGE_TTL_SECONDS = 5 * 60
RP_NAME = "BukkaPay"


def _challenge_key(user_id: str) -> str:
    return f"webauthn_challenge:{user_id}"


async def _get_credentials_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[WebauthnCredential]:
    result = await db.execute(select(WebauthnCredential).where(WebauthnCredential.user_id == user_id))
    return list(result.scalars().all())


def _parse_transports(transports: str | None) -> list | None:
    return transports.split(",") if transports else None


async def generate_registration_options_for_user(db: AsyncSession, user_id: uuid.UUID) -> dict:
    settings = get_settings()
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    existing = await _get_credentials_by_user(db, user_id)

    options = webauthn.generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=RP_NAME,
        user_id=str(user_id).encode(),
        user_name=user.email,
        user_display_name=user.name,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cred.credential_id.encode(), transports=_parse_transports(cred.transports))
            for cred in existing
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
        ),
    )

    redis = get_redis()
    await redis.set(_challenge_key(str(user_id)), base64.urlsafe_b64encode(options.challenge).decode(), ex=CHALLENGE_TTL_SECONDS)

    return json.loads(webauthn.options_to_json(options))


async def verify_registration(db: AsyncSession, user_id: uuid.UUID, credential: dict) -> None:
    settings = get_settings()
    redis = get_redis()
    challenge_b64 = await redis.get(_challenge_key(str(user_id)))
    if not challenge_b64:
        raise ApiError("Challenge expired or not found")

    try:
        verification = webauthn.verify_registration_response(
            credential=credential,
            expected_challenge=base64.urlsafe_b64decode(challenge_b64),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
        )
    except Exception as e:
        raise ApiError("Verification failed") from e
    finally:
        await redis.delete(_challenge_key(str(user_id)))

    transports = credential.get("response", {}).get("transports")
    db.add(WebauthnCredential(
        user_id=user_id,
        credential_id=webauthn.helpers.bytes_to_base64url(verification.credential_id),
        public_key=base64.b64encode(verification.credential_public_key).decode(),
        counter=verification.sign_count,
        device_type=verification.credential_device_type,
        transports=",".join(transports) if transports else None,
    ))

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is not None:
        user.biometric_enabled = True
    await db.flush()


async def generate_authentication_options_for_email(db: AsyncSession, email: str) -> dict:
    settings = get_settings()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    credentials = await _get_credentials_by_user(db, user.id)
    if not credentials:
        raise ApiError("No biometric credentials found. Please set up biometrics first.")

    options = webauthn.generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.PREFERRED,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=cred.credential_id.encode(), transports=_parse_transports(cred.transports))
            for cred in credentials
        ],
    )

    redis = get_redis()
    await redis.set(_challenge_key(str(user.id)), base64.urlsafe_b64encode(options.challenge).decode(), ex=CHALLENGE_TTL_SECONDS)

    return {"options": json.loads(webauthn.options_to_json(options)), "userId": str(user.id)}


async def verify_authentication(db: AsyncSession, response: dict, user_id_str: str) -> tuple[str, User]:
    settings = get_settings()
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as e:
        raise ApiError("User ID is required") from e

    redis = get_redis()
    challenge_b64 = await redis.get(_challenge_key(str(user_id)))
    if not challenge_b64:
        raise ApiError("Challenge expired or not found")

    credential_id = response.get("id")
    cred_result = await db.execute(
        select(WebauthnCredential).where(WebauthnCredential.credential_id == credential_id)
    )
    credential = cred_result.scalar_one_or_none()
    if credential is None or credential.user_id != user_id:
        await redis.delete(_challenge_key(str(user_id)))
        raise ApiError("Credential not found")

    try:
        verification = webauthn.verify_authentication_response(
            credential=response,
            expected_challenge=base64.urlsafe_b64decode(challenge_b64),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=base64.b64decode(credential.public_key),
            credential_current_sign_count=credential.counter,
        )
    except Exception as e:
        raise ApiError("Verification failed") from e
    finally:
        await redis.delete(_challenge_key(str(user_id)))

    credential.counter = verification.new_sign_count
    await db.flush()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    token, _ = await auth_service.create_session_for_user(db, user_id)
    return token, user


async def list_credentials(db: AsyncSession, user_id: uuid.UUID) -> list[WebauthnCredential]:
    return await _get_credentials_by_user(db, user_id)


async def delete_credential(db: AsyncSession, user_id: uuid.UUID, credential_id: str) -> None:
    try:
        credential_uuid = uuid.UUID(credential_id)
    except ValueError:
        return
    result = await db.execute(select(WebauthnCredential).where(WebauthnCredential.id == credential_uuid))
    credential = result.scalar_one_or_none()
    if credential is not None:
        await db.delete(credential)
        await db.flush()

    remaining = await _get_credentials_by_user(db, user_id)
    if not remaining:
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is not None:
            user.biometric_enabled = False
            await db.flush()


async def disable_webauthn(db: AsyncSession, user_id: uuid.UUID) -> None:
    for credential in await _get_credentials_by_user(db, user_id):
        await db.delete(credential)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is not None:
        user.biometric_enabled = False
    await db.flush()
