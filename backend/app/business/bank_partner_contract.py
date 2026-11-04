import hashlib
import hmac


def verify_bank_signature(payload: bytes, signature: str | None, secret: str | None) -> bool:
    if not payload or not signature or not secret:
        return False

    provided = (signature or "").strip()
    provided = provided.removeprefix("sha256=")

    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided)
