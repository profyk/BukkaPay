"""Exception -> JSON envelope.

Contract (verified against routes.ts): every per-route try/catch in the Node
app returns `{"error": "..."}` on business-logic failure (400/401/403/404/
409/429, via `res.status(x).json({ error: err.message })` or the
`fromZodError` 400 path). Only the outermost, never-hit-in-practice Express
error middleware in index.ts falls back to `{"message": "..."}` for truly
unhandled exceptions. ApiError is the business-logic path -> `error`;
the final catch-all here mirrors index.ts's generic handler -> `message`.
"""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import log


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": exc.message})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(status_code=exc.status_code, content={"error": detail})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else None
        message = first["msg"] if first else "Validation error"
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"error": message})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", error=str(exc), exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"message": "Internal Server Error"},
        )
