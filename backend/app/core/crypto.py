"""Application-level encryption for sensitive columns (card PAN/CVV).

Values are stored as ``enc:v1:<fernet token>``. Reads of legacy plaintext
still work (they are re-encrypted by the worker's ``encrypt_legacy_card_data``
task). Production refuses to start without ``CARD_DATA_KEY``.
"""

import base64
import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings

PREFIX = "enc:v1:"
_DEV_KEY_SEED = b"bukkapay-development-only-card-key"


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().card_data_key
    if key:
        return Fernet(key.encode())
    if get_settings().is_production:
        raise RuntimeError("CARD_DATA_KEY must be set in production")
    # Deterministic development key so local data stays readable.
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(_DEV_KEY_SEED).digest()))


def encrypt(value: str | None) -> str | None:
    if value is None or value.startswith(PREFIX):
        return value
    return PREFIX + _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if value is None or not value.startswith(PREFIX):
        return value
    try:
        return _fernet().decrypt(value[len(PREFIX):].encode()).decode()
    except InvalidToken as e:
        raise RuntimeError("card data could not be decrypted (wrong CARD_DATA_KEY?)") from e


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(PREFIX)


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt(value)

    def process_result_value(self, value, dialect):
        return decrypt(value)


def _signing_key() -> bytes:
    settings = get_settings()
    secret = settings.secret_key
    if not secret:
        if settings.is_production:
            raise RuntimeError("SECRET_KEY must be set in production")
        secret = "bukkapay-development-only-signing-key"
    return hashlib.sha256(("bukkapay-signing:" + secret).encode()).digest()


def sign(message: str) -> str:
    return hmac.new(_signing_key(), message.encode(), hashlib.sha256).hexdigest()


def verify_signature(message: str, signature: str) -> bool:
    return hmac.compare_digest(sign(message), signature or "")
