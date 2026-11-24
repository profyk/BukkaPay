"""Per-country beneficiary formats for bank and mobile-wallet payouts.

These are format checks only (they catch typos before money moves); the
rail confirms the account exists. Corridor-specific required fields that
the provider imposes are TODO(vendor-docs) and enforced in `required_extra`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.errors import ApiError


@dataclass(frozen=True)
class CountryRules:
    currency: str
    dial: str                 # E.164 country code, digits only
    mobile_digits: int        # national number length after the country code
    bank_account: str         # regex for account numbers
    branch_code: str | None   # regex, when the country routes by branch
    mobile_operators: tuple[str, ...] = ()


RULES: dict[str, CountryRules] = {
    "ZA": CountryRules("ZAR", "27", 9, r"\d{7,11}", r"\d{6}", ()),
    "BW": CountryRules("BWP", "267", 8, r"\d{8,16}", r"\d{6}", ("orange", "mascom", "btc")),
    "ZW": CountryRules("USD", "263", 9, r"\d{7,16}", None, ("ecocash", "onemoney", "telecash")),
    "ZM": CountryRules("ZMW", "260", 9, r"\d{8,16}", r"\d{6}", ("mtn", "airtel", "zamtel")),
    "NA": CountryRules("NAD", "264", 9, r"\d{8,13}", r"\d{6}", ("mtc",)),
    "MZ": CountryRules("MZN", "258", 9, r"\d{8,21}", None, ("mpesa", "emola", "mkesh")),
    "MW": CountryRules("MWK", "265", 9, r"\d{8,16}", None, ("airtel", "tnm")),
    "KE": CountryRules("KES", "254", 9, r"\d{8,16}", None, ("mpesa", "airtel")),
    "UG": CountryRules("UGX", "256", 9, r"\d{8,16}", None, ("mtn", "airtel")),
    "TZ": CountryRules("TZS", "255", 9, r"\d{8,16}", None, ("mpesa", "tigo", "airtel", "halopesa")),
    "GH": CountryRules("GHS", "233", 9, r"\d{10,16}", None, ("mtn", "vodafone", "airteltigo")),
    "NG": CountryRules("NGN", "234", 10, r"\d{10}", None, ()),  # NUBAN; bank payouts only
}


def rules(country: str) -> CountryRules:
    r = RULES.get(country.upper())
    if r is None:
        raise ApiError(f"Payouts to {country} aren't available yet", status_code=409)
    return r


def normalize_msisdn(country: str, raw: str) -> str:
    """Accepts local (0…) or international (+/00…) formats; returns +<E.164>."""
    r = rules(country)
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith(r.dial):
        national = digits[len(r.dial):]
    elif digits.startswith("0"):
        national = digits[1:]
    else:
        national = digits
    if len(national) != r.mobile_digits or not national.isdigit():
        raise ApiError(f"Enter a valid {country} mobile number")
    return f"+{r.dial}{national}"


def validate_recipient(*, country: str, method: str, currency: str, first_name: str, last_name: str,
                       account_number: str | None = None, branch_code: str | None = None, bank_code: str | None = None,
                       msisdn: str | None = None, operator: str | None = None) -> dict:
    """Returns the cleaned fields or raises ApiError with a message for the user."""
    r = rules(country)
    if currency.upper() != r.currency:
        raise ApiError(f"Payouts to {country} are paid in {r.currency}")
    for label, v in (("first name", first_name), ("last name", last_name)):
        if not v or len(v.strip()) < 2 or len(v) > 80 or re.search(r"[<>{}\[\]\\;]", v):
            raise ApiError(f"Enter the recipient's {label}")
    out = {"country": country.upper(), "currency": r.currency, "method": method,
           "first_name": first_name.strip(), "last_name": last_name.strip()}
    if method == "bank":
        acct = re.sub(r"[\s-]", "", account_number or "")
        if not re.fullmatch(r.bank_account, acct):
            raise ApiError(f"Enter a valid {country} bank account number")
        if not bank_code or not re.fullmatch(r"[A-Za-z0-9_-]{2,20}", bank_code):
            raise ApiError("Choose the recipient's bank")
        out.update(account_number=acct, bank_code=bank_code)
        if r.branch_code:
            bc = re.sub(r"\D", "", branch_code or "")
            if bc and not re.fullmatch(r.branch_code, bc):
                raise ApiError("Enter a valid branch code")
            out["branch_code"] = bc or None
    elif method == "mobile_wallet":
        if not r.mobile_operators:
            raise ApiError(f"Mobile wallet payouts to {country} aren't available yet", status_code=409)
        op = (operator or "").lower()
        if op not in r.mobile_operators:
            raise ApiError(f"Choose a mobile wallet: {', '.join(r.mobile_operators)}")
        out.update(msisdn=normalize_msisdn(country, msisdn or ""), operator=op)
    else:
        raise ApiError("Payout method must be bank or mobile_wallet")
    return out


def required_extra(country: str, method: str) -> tuple[str, ...]:
    # TODO(vendor-docs): Onafriq's per-corridor mandatory sender/recipient
    # fields (e.g. recipient address, ID type/number, relationship, purpose
    # code). Until then we require what regulators commonly ask for.
    return ("purpose",)
