import secrets


def generate_otp_code(length: int = 6) -> str:
    if length < 4 or length > 12:
        raise ValueError("OTP length must be between 4 and 12 digits")
    return "".join(secrets.choice("0123456789") for _ in range(length))


def is_valid_otp(expected: str, provided: str, length: int = 6) -> bool:
    if not expected or not provided:
        return False

    expected_value = str(expected).strip()
    provided_value = str(provided).strip()

    if len(provided_value) != length or not provided_value.isdigit():
        return False

    return secrets.compare_digest(expected_value, provided_value)
