"""Password/PIN hashing.

Preserves the exact behavior of the old Node auth.ts: bcrypt (cost 12) is the
live scheme, but real production rows may still hold legacy SHA-256 hex
digests from before bcrypt was introduced. verify_secret() checks bcrypt
first and falls back to SHA-256, flagging `needs_rehash` so the caller can
upgrade the stored hash on a successful legacy login.
"""

import hashlib
import secrets

import bcrypt

BCRYPT_ROUNDS = 12


def hash_secret(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_secret(plain: str, hashed: str) -> tuple[bool, bool]:
    """Returns (valid, needs_rehash)."""
    if hashed.startswith(("$2b$", "$2a$", "$2y$")):
        valid = bcrypt.checkpw(plain.encode(), hashed.encode())
        return valid, False

    # Legacy SHA-256 path.
    sha256_hex = hashlib.sha256(plain.encode()).hexdigest()
    valid = secrets.compare_digest(sha256_hex, hashed)
    return valid, valid  # only rehash if the password was actually correct


def generate_wallet_id() -> str:
    return f"BKP-{secrets.token_hex(8).upper()}"


def generate_session_token() -> str:
    return secrets.token_hex(32)
