import hashlib
import hmac

from app.business.bank_partner_contract import verify_bank_signature


def test_verify_bank_signature_accepts_valid_hash() -> None:
    payload = b'{"event":"transfer.settled","id":"abc123"}'
    secret = "bank-secret-key"
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    assert verify_bank_signature(payload, f"sha256={digest}", secret) is True


def test_verify_bank_signature_rejects_invalid_hash() -> None:
    payload = b'{"event":"transfer.settled","id":"abc123"}'
    assert verify_bank_signature(payload, "sha256=invalid", "bank-secret-key") is False
