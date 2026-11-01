from __future__ import annotations

from app.integrations.bank_partner import BankPartnerClient, is_bank_partner_configured, verify_webhook_signature


class BankPartnerService:
    @staticmethod
    def is_configured() -> bool:
        return is_bank_partner_configured()

    @staticmethod
    async def initiate_transfer(
        *,
        amount: float,
        currency: str,
        beneficiary_name: str,
        beneficiary_account: str,
        reference: str,
        narrative: str | None = None,
    ) -> dict:
        client = BankPartnerClient()
        transfer = await client.initiate_transfer(
            amount=amount,
            currency=currency,
            beneficiary_name=beneficiary_name,
            beneficiary_account=beneficiary_account,
            reference=reference,
            narrative=narrative,
        )
        return {
            "transferId": transfer.transfer_id,
            "status": transfer.status,
            "provider": transfer.provider,
        }

    @staticmethod
    def verify_webhook(payload: bytes, signature: str | None) -> bool:
        return verify_webhook_signature(payload, signature)
