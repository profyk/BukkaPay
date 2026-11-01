from __future__ import annotations

from app.business.otp_flow import generate_otp_code, is_valid_otp
from app.core.redis import get_redis

OTP_TTL_SECONDS = 300


async def issue_otp(email: str, *, code_length: int = 6, ttl_seconds: int = OTP_TTL_SECONDS) -> str:
    code = generate_otp_code(code_length)
    redis = get_redis()
    await redis.set(f"otp:{email.lower().strip()}", code, ex=ttl_seconds)
    return code


async def verify_otp(email: str, provided_code: str, *, code_length: int = 6) -> bool:
    redis = get_redis()
    stored = await redis.get(f"otp:{email.lower().strip()}")
    if not stored:
        return False

    is_valid = is_valid_otp(stored, provided_code, length=code_length)
    if is_valid:
        await redis.delete(f"otp:{email.lower().strip()}")
    return is_valid
