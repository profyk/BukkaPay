"""Redis-backed sliding-window rate limiter, replacing express-rate-limit.

Usage as a FastAPI dependency:

    @router.post("/auth/login", dependencies=[Depends(rate_limit("auth-login", limit=10, window_seconds=60))])
"""

from fastapi import Request

from app.core.errors import ApiError
from app.core.redis import get_redis


def rate_limit(bucket: str, limit: int, window_seconds: int):
    async def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{bucket}:{client_ip}"
        redis = get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window_seconds)
        if count > limit:
            raise ApiError("Too many requests, please try again later.", status_code=429)

    return _dependency
