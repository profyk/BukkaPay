"""South African instant-EFT (Stitch) integration: pay-by-bank top-ups and
payouts. Stitch does not issue cards; cards come from the issuer-processor
(app.cards.issuers)."""

import time
from decimal import Decimal

import httpx

from app.core.config import get_settings

STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token"
STITCH_API_URL = "https://api.stitch.money/graphql"


def is_stitch_payments_configured() -> bool:
    """Instant-EFT top-ups and
    withdrawals only need the client credentials + a receiving account
    number, not a card program id."""
    settings = get_settings()
    return bool(
        settings.stitch_client_id and settings.stitch_client_secret and settings.bukkapay_account_number
    )


_token_cache: dict | None = None


async def _get_access_token() -> str:
    global _token_cache
    if _token_cache and time.time() * 1000 < _token_cache["expires_at"] - 60_000:
        return _token_cache["token"]

    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            STITCH_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.stitch_client_id,
                "client_secret": settings.stitch_client_secret,
                "audience": "https://api.stitch.money",
                "scope": "client_paymentrequest client_disbursement",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Stitch auth failed: {response.text}")

    data = response.json()
    _token_cache = {
        "token": data["access_token"],
        "expires_at": time.time() * 1000 + data["expires_in"] * 1000,
    }
    return _token_cache["token"]


class StitchRejected(RuntimeError):
    """Stitch definitively refused the request (4xx or a GraphQL error), so
    nothing was executed. Network errors, timeouts and 5xx responses are
    *not* this: their outcome is unknown and must be confirmed later."""


async def _gql(query: str, variables: dict) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            STITCH_API_URL,
            json={"query": query, "variables": variables},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
    if 400 <= response.status_code < 500:
        raise StitchRejected(f"Stitch API {response.status_code}: {response.text[:300]}")
    if response.status_code >= 500:
        raise RuntimeError(f"Stitch API {response.status_code}: {response.text[:300]}")

    body = response.json()
    if body.get("errors"):
        raise StitchRejected(body["errors"][0].get("message", "Stitch GraphQL error"))
    return body["data"]


async def create_payment_request(
    amount: float, currency: str, reference: str, payer_reference: str, redirect_url: str
) -> dict:
    settings = get_settings()
    data = await _gql(
        """mutation CreatePaymentRequest($input: PaymentInitiationRequestInput!) {
            clientPaymentInitiationRequestCreate(input: $input) {
                paymentInitiationRequest { id url }
            }
        }""",
        {
            "input": {
                "amount": {"quantity": f"{amount:.2f}", "currency": currency},
                "payerReference": payer_reference,
                "beneficiaryReference": reference,
                "externalReference": reference,
                "beneficiary": {
                    "bankAccount": {
                        "name": settings.bukkapay_account_name,
                        "bankId": settings.bukkapay_bank_id,
                        "accountNumber": settings.bukkapay_account_number,
                        "accountType": "current",
                        "branchCode": settings.bukkapay_branch_code,
                    }
                },
                "redirectUrl": redirect_url,
            }
        },
    )
    return data["clientPaymentInitiationRequestCreate"]["paymentInitiationRequest"]


async def get_payment_result(payment_request_id: str) -> tuple[str, Decimal | None]:
    """("completed" | "failed" | "pending", amount actually paid or None)."""
    data = await _gql(
        """query PaymentStatus($id: ID!) {
            node(id: $id) {
                ... on PaymentInitiationRequest {
                    status {
                        __typename
                        ... on PaymentInitiationRequestComplete { amount { quantity currency } }
                        ... on PaymentInitiationRequestFailed { reason }
                    }
                }
            }
        }""",
        {"id": payment_request_id},
    )
    status = (data.get("node") or {}).get("status") or {}
    typename = status.get("__typename")
    if typename == "PaymentInitiationRequestComplete":
        quantity = (status.get("amount") or {}).get("quantity")
        return "completed", Decimal(str(quantity)) if quantity is not None else None
    if typename == "PaymentInitiationRequestFailed":
        return "failed", None
    return "pending", None


async def get_payment_status(payment_request_id: str) -> str:
    data = await _gql(
        """query PaymentStatus($id: ID!) {
            node(id: $id) {
                ... on PaymentInitiationRequest {
                    status {
                        __typename
                        ... on PaymentInitiationRequestComplete { amount { quantity } }
                        ... on PaymentInitiationRequestFailed { reason }
                    }
                }
            }
        }""",
        {"id": payment_request_id},
    )
    typename = (data.get("node") or {}).get("status", {}).get("__typename")
    if typename == "PaymentInitiationRequestComplete":
        return "completed"
    if typename == "PaymentInitiationRequestFailed":
        return "failed"
    return "pending"


async def create_disbursement(
    amount: float,
    currency: str,
    reference: str,
    recipient_name: str,
    bank_id: str,
    account_number: str,
    account_type: str,
) -> dict:
    data = await _gql(
        """mutation CreateDisbursement($input: DisbursementCreateInput!) {
            disbursementCreate(input: $input) {
                disbursement { id status }
            }
        }""",
        {
            "input": {
                "amount": {"quantity": f"{amount:.2f}", "currency": currency},
                "externalReference": reference,
                "beneficiary": {
                    "bankAccount": {
                        "name": recipient_name,
                        "bankId": bank_id,
                        "accountNumber": account_number,
                        "accountType": account_type,
                    }
                },
            }
        },
    )
    return data["disbursementCreate"]["disbursement"]
