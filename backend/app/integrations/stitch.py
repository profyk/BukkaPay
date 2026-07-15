"""South African instant-EFT (Stitch) integration — httpx port of the old
stitch.ts. Behavior-identical: same Luhn-valid local-card fallback when
Stitch isn't configured, same GraphQL client/token-cache shape.
"""

import random
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from app.core.config import get_settings

STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token"
STITCH_API_URL = "https://api.stitch.money/graphql"


def _luhn_check_digit(partial: str) -> str:
    digits = [int(d) for d in partial]
    total = 0
    double_it = True
    for d in reversed(digits):
        if double_it:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double_it = not double_it
    return str((10 - (total % 10)) % 10)


@dataclass
class LocalCardDetails:
    card_number: str
    expiry_date: str
    cvv: str


def generate_local_card_details() -> LocalCardDetails:
    bin_prefix = "5399"  # Mastercard prepaid BIN (ZA)
    mid = "".join(str(random.randint(0, 9)) for _ in range(11))
    partial = bin_prefix + mid
    raw = partial + _luhn_check_digit(partial)
    card_number = f"{raw[0:4]} {raw[4:8]} {raw[8:12]} {raw[12:16]}"
    now = datetime.now(UTC)
    expiry_date = f"{now.month:02d}/{str(now.year + 3)[-2:]}"
    cvv = str(random.randint(100, 999))
    return LocalCardDetails(card_number=card_number, expiry_date=expiry_date, cvv=cvv)


def is_stitch_card_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.stitch_client_id and settings.stitch_client_secret and settings.stitch_card_program_id
    )


def is_stitch_payments_configured() -> bool:
    """Distinct from is_stitch_card_configured() — instant-EFT top-ups and
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


async def _gql(query: str, variables: dict) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            STITCH_API_URL,
            json={"query": query, "variables": variables},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Stitch API {response.status_code}: {response.text}")

    body = response.json()
    if body.get("errors"):
        raise RuntimeError(body["errors"][0].get("message", "Stitch GraphQL error"))
    return body["data"]


@dataclass
class IssuedCard:
    stitch_card_id: str
    card_number: str
    expiry_date: str
    cvv: str


async def issue_virtual_card(holder_name: str, reference: str) -> IssuedCard:
    if not is_stitch_card_configured():
        local = generate_local_card_details()
        return IssuedCard(
            stitch_card_id=f"LOCAL-{reference}",
            card_number=local.card_number,
            expiry_date=local.expiry_date,
            cvv=local.cvv,
        )

    settings = get_settings()
    try:
        data = await _gql(
            """mutation IssueVirtualCard($input: VirtualCardCreateInput!) {
                virtualCardCreate(input: $input) {
                    virtualCard { id pan cvv expiryMonth expiryYear }
                }
            }""",
            {
                "input": {
                    "programId": settings.stitch_card_program_id,
                    "holderName": holder_name,
                    "externalReference": reference,
                }
            },
        )
        vc = data["virtualCardCreate"]["virtualCard"]
        pan = vc["pan"]
        card_number = f"{pan[0:4]} {pan[4:8]} {pan[8:12]} {pan[12:16]}"
        expiry_date = f"{int(vc['expiryMonth']):02d}/{str(vc['expiryYear'])[-2:]}"
        return IssuedCard(
            stitch_card_id=vc["id"], card_number=card_number, expiry_date=expiry_date, cvv=vc["cvv"]
        )
    except Exception:
        local = generate_local_card_details()
        return IssuedCard(
            stitch_card_id=f"LOCAL-{reference}",
            card_number=local.card_number,
            expiry_date=local.expiry_date,
            cvv=local.cvv,
        )


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
