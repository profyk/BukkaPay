import re

from app.business.otp_flow import generate_otp_code, is_valid_otp


def test_generate_otp_code_returns_numeric_code() -> None:
    code = generate_otp_code()
    assert re.fullmatch(r"\d{6}", code)


def test_is_valid_otp_handles_expected_values() -> None:
    code = "123456"
    assert is_valid_otp(code, code)
    assert not is_valid_otp(code, "654321")
    assert not is_valid_otp(code, "12345")
