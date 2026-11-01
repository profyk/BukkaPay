from fastapi import APIRouter, Header, HTTPException, Request

from app.services.bank_partner_service import BankPartnerService

router = APIRouter(tags=["bank-partner"])


@router.get("/api/bank-partner/status")
async def bank_partner_status() -> dict:
    return {"configured": BankPartnerService.is_configured()}


@router.post("/api/bank-partner/webhook")
async def bank_partner_webhook(request: Request, x_signature: str | None = Header(default=None, alias="X-Signature")) -> dict:
    raw = await request.body()
    if not BankPartnerService.verify_webhook(raw, x_signature):
        raise HTTPException(status_code=401, detail="Invalid bank partner webhook signature")
    return {"success": True, "status": "accepted"}
