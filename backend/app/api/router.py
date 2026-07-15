"""Aggregates every domain router under the exact same unprefixed `/api/...`
paths the Node backend used, so the mobile app and admin panel need zero
changes. Routers are added here as each domain lands (see the phased plan);
this file is intentionally the single place that wires the whole API surface
together.
"""

from fastapi import APIRouter

from app.api import auth, misc, wallet

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(wallet.router)
api_router.include_router(misc.router)

admin_router = APIRouter(prefix="/api/admin")

# from app.api.admin import auth as admin_auth
# admin_router.include_router(admin_auth.router)
