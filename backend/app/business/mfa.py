import base64
import hashlib
import hmac
import secrets
import time


def generate_totp_secret(length: int = 32) -> str:
    return base64.b32encode(secrets.token_bytes(length)).decode("ascii").rstrip("=")


def _totp(secret: str, timestamp: int, digits: int = 6, period: int = 30) -> str:
    counter = timestamp // period
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
    msg = counter.to_bytes(length=8, byteorder="big")
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    # RFC 4226 dynamic truncation: only the top bit of the first byte is masked.
    truncated = (((digest[offset] & 0x7F) << 24) | (digest[offset + 1] << 16)
                 | (digest[offset + 2] << 8) | digest[offset + 3])
    code = truncated % (10 ** digits)
    return str(code).zfill(digits)


def current_totp(secret: str, digits: int = 6, period: int = 30) -> str:
    return _totp(secret, int(time.time()), digits=digits, period=period)


def verify_totp(secret: str, provided_code: str, digits: int = 6, period: int = 30, window: int = 1) -> bool:
    if not secret or not provided_code:
        return False
    try:
        code = int(provided_code.strip())
    except ValueError:
        return False

    current = int(time.time())
    for offset in range(-window, window + 1):
        candidate = _totp(secret, current + offset * period, digits=digits, period=period)
        if int(candidate) == code:
            return True
    return False
