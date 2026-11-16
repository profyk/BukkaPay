"""Signed merchant QR payloads.

Payload format (what the QR encodes): ``bukkapay:qr:v1:<qr_id>:<signature>``.
The signature is an HMAC over the QR id, so a printed code can't be edited
to point at a different merchant or amount; the amount/currency/reference
always come from the stored ``merchant_qr_codes`` row, never from the scan.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.errors import ApiError
from app.models.merchant import Merchant
from app.models.platform import MerchantQrCode

PREFIX = "bukkapay:qr:v1:"


def payload_for(qr: MerchantQrCode) -> str:
    return f"{PREFIX}{qr.id}:{crypto.sign(f'qr:{qr.id}')[:32]}"


async def resolve(db: AsyncSession, payload: str) -> tuple[MerchantQrCode, Merchant]:
    if not payload.startswith(PREFIX):
        raise ApiError("This is not a BukkaPay merchant QR code")
    try:
        qr_id, signature = payload[len(PREFIX):].split(":", 1)
        qr_uuid = uuid.UUID(qr_id)
    except ValueError as e:
        raise ApiError("Invalid QR code") from e
    if not crypto.verify_signature(f"qr:{qr_uuid}", signature) and crypto.sign(f"qr:{qr_uuid}")[:32] != signature:
        raise ApiError("QR code signature is invalid", status_code=400)
    qr = await db.get(MerchantQrCode, qr_uuid)
    if qr is None:
        raise ApiError("QR code not found", status_code=404)
    if qr.status != "active":
        raise ApiError(f"This QR code is {qr.status}", status_code=410)
    if qr.expires_at is not None and qr.expires_at <= datetime.now(UTC):
        qr.status = "expired"
        await db.flush()
        raise ApiError("This QR code has expired", status_code=410)
    merchant = await db.get(Merchant, qr.merchant_id)
    if merchant is None:
        raise ApiError("This merchant can't accept payments right now", status_code=403)
    from app.services.merchant_service import require_can_transact

    try:
        require_can_transact(merchant)
    except ApiError as e:
        raise ApiError("This merchant can't accept payments right now", status_code=403) from e
    return qr, merchant
