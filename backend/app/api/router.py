"""Aggregates every domain router under the exact same unprefixed `/api/...`
paths the Node backend used, so the mobile app and admin panel need zero
changes. Routers are added here as each domain lands (see the phased plan);
this file is intentionally the single place that wires the whole API surface
together.
"""

from fastapi import APIRouter

from app.api import (
    auth,
    bill_split,
    billing_link,
    claim_payment,
    contribution,
    gift_card,
    loyalty,
    merchant,
    misc,
    notification,
    payment_link,
    purchase_transaction,
    rental,
    stitch,
    upload,
    wallet,
    webauthn,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(wallet.router)
api_router.include_router(misc.router)
api_router.include_router(merchant.router)
api_router.include_router(payment_link.router)
api_router.include_router(claim_payment.router)
api_router.include_router(bill_split.router)
api_router.include_router(purchase_transaction.router)
api_router.include_router(rental.router)
api_router.include_router(gift_card.router)
api_router.include_router(contribution.router)
api_router.include_router(billing_link.router)
api_router.include_router(loyalty.router)
api_router.include_router(notification.router)
api_router.include_router(upload.router)
api_router.include_router(webauthn.router)
api_router.include_router(stitch.router)

from app.api.admin import auth as admin_auth
from app.api.admin import finance as admin_finance
from app.api.admin import platform as admin_platform
from app.api.admin import users as admin_users

admin_router = APIRouter(prefix="/api/admin")
admin_router.include_router(admin_auth.router)
admin_router.include_router(admin_users.router)
admin_router.include_router(admin_finance.router)
admin_router.include_router(admin_platform.router)
