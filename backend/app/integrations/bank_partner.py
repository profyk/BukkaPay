from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

import httpx

from app.business.bank_partner_contract import verify_bank_signature
from app.core.config import get_settings


@dataclass
class BankPartnerTransfer:
    transfer_id: str
    status: str
    provider: str


def is_bank_partner_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.bank_partner_api_url
        and settings.bank_partner_api_key
        and settings.bank_partner_account_id
    )


def verify_webhook_signature(payload: bytes, signature: str | None) -> bool:
    settings = get_settings()
    return verify_bank_signature(payload, signature, settings.bank_partner_webhook_secret)


class BankPartnerClient:
    def __init__(self) -> None:
        settings = get_settings()
        if not is_bank_partner_configured():
            raise RuntimeError("Bank partner credentials are not configured")
        self.api_url = settings.bank_partner_api_url.rstrip("/")
        self.api_key = settings.bank_partner_api_key
        self.account_id = settings.bank_partner_account_id
        self.webhook_secret = settings.bank_partner_webhook_secret

    async def initiate_transfer(
        self,
        *,
        amount: float,
        currency: str,
        beneficiary_name: str,
        beneficiary_account: str,
        reference: str,
        narrative: str | None = None,
    ) -> BankPartnerTransfer:
        payload = {
            "accountId": self.account_id,
            "amount": round(amount, 2),
            "currency": currency,
            "beneficiaryName": beneficiary_name,
            "beneficiaryAccount": beneficiary_account,
            "reference": reference,
            "narrative": narrative or "BukkaPay transfer",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self.api_url}/transfers",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "X-Request-Id": reference,
                },
            )
        if response.status_code >= 400:
            raise RuntimeError(f"Bank partner transfer failed: {response.text}")

        data = response.json()
        return BankPartnerTransfer(
            transfer_id=str(data.get("id") or data.get("transferId") or reference),
            status=str(data.get("status") or "pending"),
            provider="bank_partner",
        )

    async def get_account_balance(self) -> dict:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self.api_url}/accounts/{self.account_id}/balance",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
        if response.status_code >= 400:
            raise RuntimeError(f"Bank partner balance fetch failed: {response.text}")
        return response.json()
