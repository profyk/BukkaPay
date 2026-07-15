"""Security headers + request logging middleware.

security headers reproduce the current helmet() config: cross-origin
resource policy so mobile apps can load assets, CSP disabled (this is a pure
API server, no HTML is served except the root landing page).
"""

import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.core.logging import log

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
    "X-DNS-Prefetch-Control": "off",
}


def register_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def security_and_logging(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value

        if request.url.path.startswith("/api"):
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=duration_ms,
            )
        return response
