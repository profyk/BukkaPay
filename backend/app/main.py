from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from app.api.router import admin_router, api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, log
from app.core.middleware import register_middleware
from app.core.redis import close_redis, get_redis
from app.db.base import dispose_engine, get_engine

LANDING_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BukkaPay - Smart Mobile Wallet</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#001A72;
color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}
.card{text-align:center;padding:40px}
h1{font-size:40px;font-weight:800;margin-bottom:8px}
p{color:rgba(255,255,255,.7)}
.pill{display:inline-flex;align-items:center;gap:8px;background:rgba(16,185,129,.15);color:#34D399;
padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;margin-top:20px}
</style></head><body>
<div class="card"><h1>BukkaPay</h1><p>API is running (FastAPI).</p>
<div class="pill">&#9679; Online</div></div>
</body></html>"""


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    configure_logging(settings.env)
    get_engine()
    get_redis()
    log.info("startup", env=settings.env, port=settings.port)
    yield
    await dispose_engine()
    await close_redis()
    log.info("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="BukkaPay API", lifespan=lifespan)

    register_middleware(app)
    register_exception_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else settings.allowed_origins_list or ["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "x-admin-token", "x-api-key"],
        max_age=86400,
    )

    app.include_router(api_router)
    app.include_router(admin_router)

    @app.get("/", response_class=HTMLResponse)
    async def root() -> str:
        return LANDING_HTML

    @app.get("/healthz")
    async def healthz() -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return app
