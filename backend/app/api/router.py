"""Aggregates every domain router under the exact same unprefixed `/api/...`
paths the Node backend used, so the mobile app and admin panel need zero
changes. Routers are added here as each domain lands (see the phased plan);
this file is intentionally the single place that wires the whole API surface
together.
"""

from fastapi import APIRouter

from app.api import account as account_api
from app.api import agents as agents_api
from app.api import analytics as analytics_api
from app.api import (
    auth,
    bank_partner,
    billing_link,
    card_webhooks,
    cards,
    chat,
    claim_payment,
    contribution,
    kyc,
    loyalty,
    merchant,
    merchant_platform,
    misc,
    notification,
    payment_link,
    public,
    purchase_transaction,
    stitch,
    travel,
    upload,
    wallet,
    webauthn,
)
from app.api import payouts as payouts_api
from app.api import push as push_api
from app.api import trade as trade_api

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(wallet.router)
api_router.include_router(cards.router)
api_router.include_router(misc.router)
api_router.include_router(merchant.router)
api_router.include_router(merchant_platform.router)
api_router.include_router(payment_link.router)
api_router.include_router(claim_payment.router)
api_router.include_router(purchase_transaction.router)
api_router.include_router(contribution.router)
api_router.include_router(billing_link.router)
api_router.include_router(loyalty.router)
api_router.include_router(notification.router)
api_router.include_router(push_api.router)
api_router.include_router(payouts_api.router)
api_router.include_router(agents_api.router)
api_router.include_router(account_api.router)
api_router.include_router(analytics_api.router)
api_router.include_router(upload.router)
api_router.include_router(webauthn.router)
api_router.include_router(stitch.router)
api_router.include_router(bank_partner.router)
api_router.include_router(kyc.router)
api_router.include_router(travel.router)
api_router.include_router(chat.router)
api_router.include_router(public.router)
api_router.include_router(trade_api.router)
api_router.include_router(card_webhooks.router)

from app.api.admin import auth as admin_auth
from app.api.admin import cards as admin_cards
from app.api.admin import chat as admin_chat
from app.api.admin import finance as admin_finance
from app.api.admin import fx as admin_fx
from app.api.admin import legal as admin_legal
from app.api.admin import network as admin_network
from app.api.admin import platform as admin_platform
from app.api.admin import revenue as admin_revenue
from app.api.admin import settlements as admin_settlements
from app.api.admin import trade as admin_trade
from app.api.admin import travel as admin_travel
from app.api.admin import users as admin_users
from app.api.admin import website as admin_website

admin_router = APIRouter(prefix="/api/admin")
admin_router.include_router(admin_auth.router)
admin_router.include_router(admin_users.router)
admin_router.include_router(admin_finance.router)
admin_router.include_router(admin_platform.router)
admin_router.include_router(admin_travel.router)
admin_router.include_router(admin_chat.router)
admin_router.include_router(admin_network.router)
admin_router.include_router(admin_cards.router)
admin_router.include_router(admin_website.router)
admin_router.include_router(admin_legal.router)
admin_router.include_router(admin_trade.router)
admin_router.include_router(admin_fx.router)
admin_router.include_router(admin_revenue.router)
admin_router.include_router(admin_settlements.router)
