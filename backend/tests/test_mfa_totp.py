"""TOTP must match real authenticator apps: RFC 6238 Appendix B test vectors
(SHA-1, secret "12345678901234567890")."""

import base64

import pytest

from app.business import mfa

SECRET = base64.b32encode(b"12345678901234567890").decode()


@pytest.mark.parametrize("timestamp,expected8", [
    (59, "94287082"),
    (1111111109, "07081804"),
    (1111111111, "14050471"),
    (1234567890, "89005924"),
    (2000000000, "69279037"),
])
def test_rfc6238_vectors(timestamp, expected8):
    assert mfa._totp(SECRET, timestamp, digits=8) == expected8
    assert mfa._totp(SECRET, timestamp, digits=6) == expected8[-6:]
