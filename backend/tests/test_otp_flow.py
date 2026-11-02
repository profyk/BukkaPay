import re

from app.business.otp_flow import generate_otp_code, is_valid_otp
from app.core.redis import get_redis


def test_generate_otp_code_returns_numeric_code() -> None:
    code = generate_otp_code()
    assert re.fullmatch(r"\d{6}", code)


def test_is_valid_otp_handles_expected_values() -> None:
    code = "123456"
    assert is_valid_otp(code, code)
    assert not is_valid_otp(code, "654321")
    assert not is_valid_otp(code, "12345")


async def test_otp_request_and_verify_round_trip(client) -> None:
    email = "otp-user@example.com"

    response = await client.post("/api/auth/otp/request", json={"email": email})
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True

    code = await get_redis().get(f"otp:{email.lower()}")
    assert code is not None
    assert len(code) == 6
    assert code.isdigit()

    verify_response = await client.post("/api/auth/otp/verify", json={"email": email, "code": code})
    assert verify_response.status_code == 200, verify_response.text
    assert verify_response.json()["verified"] is True

    invalid_response = await client.post("/api/auth/otp/verify", json={"email": email, "code": "000000"})
    assert invalid_response.status_code == 401, invalid_response.text
