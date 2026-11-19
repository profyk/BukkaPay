"""The standard set of BukkaPay legal documents and the company details that
fill their placeholders.

Each document starts from a template in ./templates/<slug>.md. Until an admin
publishes a version, the website serves the template, clearly marked as a
draft awaiting legal review. Templates are written in a small Markdown subset
(## / ### headings, paragraphs, - and 1. lists, **bold**, [links](url) and
> notes) and may use {{placeholders}} for company details.
"""

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator

from app.schemas.base import CamelModel

TEMPLATE_DIR = Path(__file__).parent / "templates"


@dataclass(frozen=True)
class Standard:
    slug: str
    title: str
    summary: str
    audience: str
    order: int


STANDARD: tuple[Standard, ...] = (
    Standard("terms", "Terms and Conditions",
             "The agreement between you and BukkaPay for using the app, your wallet and payments.", "everyone", 10),
    Standard("privacy-policy", "Privacy Policy",
             "What personal information we collect, why, who we share it with and your rights.", "everyone", 20),
    Standard("cookies", "Cookie Policy",
             "The cookies and similar technologies our website and web app use.", "everyone", 30),
    Standard("data-breach", "Data Breach Response and Notification Policy",
             "How we detect, contain and report security incidents, and when we tell you.", "everyone", 40),
    Standard("aml-risk", "Anti-Money Laundering, Counter-Terrorist Financing and Sanctions Policy",
             "How we verify customers, monitor transactions and meet financial crime laws.", "everyone", 50),
    Standard("merchant-terms", "Merchant Terms",
             "Additional terms for businesses and sellers accepting payments with BukkaPay.", "merchants", 60),
    Standard("cardholder-terms", "Virtual Visa Card Terms",
             "Terms for the virtual Visa card linked to your BukkaPay wallet.", "cardholders", 70),
    Standard("acceptable-use", "Acceptable Use Policy",
             "What BukkaPay may not be used for, including prohibited businesses.", "everyone", 80),
    Standard("complaints", "Complaints and Disputes Policy",
             "How to complain, how we handle it, and where to escalate.", "everyone", 90),
    Standard("refunds", "Refunds, Reversals and Chargebacks Policy",
             "When payments can be refunded or reversed and how card disputes work.", "everyone", 100),
    Standard("paia-manual", "PAIA and POPIA Manual (South Africa)",
             "How to request access to records under South Africa's PAIA and POPIA.", "everyone", 110),
)

BY_SLUG = {s.slug: s for s in STANDARD}


@lru_cache
def template(slug: str) -> str:
    return (TEMPLATE_DIR / f"{slug}.md").read_text(encoding="utf-8").strip() + "\n"


class LegalDetails(CamelModel):
    """Company details substituted into every document. Empty fields show as
    a visible [placeholder] so gaps are obvious to readers and reviewers."""

    legal_name: str = Field(default="", max_length=160)
    trading_name: str = Field(default="BukkaPay", max_length=80)
    registration_number: str = Field(default="", max_length=80)
    country_of_incorporation: str = Field(default="", max_length=80)
    registered_address: str = Field(default="", max_length=300)
    information_officer: str = Field(default="", max_length=120)
    information_officer_email: str = Field(default="", max_length=120)
    privacy_email: str = Field(default="privacy@bukkapay.com", max_length=120)
    support_email: str = Field(default="hello@bukkapay.com", max_length=120)
    compliance_email: str = Field(default="compliance@bukkapay.com", max_length=120)
    security_email: str = Field(default="", max_length=120)
    complaints_email: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    governing_law: str = Field(default="", max_length=120)
    partner_institutions: str = Field(default="", max_length=400)
    card_issuer: str = Field(default="", max_length=200)
    website_url: str = Field(default="https://www.bukkapay.com", max_length=120)

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


PLACEHOLDER_LABELS: dict[str, str] = {
    "legal_name": "Company legal name",
    "trading_name": "Trading name",
    "registration_number": "Company registration number",
    "country_of_incorporation": "Country of incorporation",
    "registered_address": "Registered address",
    "information_officer": "Information Officer name",
    "information_officer_email": "Information Officer email",
    "privacy_email": "Privacy email",
    "support_email": "Support email",
    "compliance_email": "Compliance email",
    "security_email": "Security incident email",
    "complaints_email": "Complaints email",
    "phone": "Phone number",
    "governing_law": "Governing law",
    "partner_institutions": "Names of licensed partner institutions",
    "card_issuer": "Card issuer name",
    "website_url": "Website address",
}

_TOKEN = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")


def fill(text: str, details: LegalDetails) -> str:
    """Replace {{tokens}} with company details; blanks become [labels].
    Complaints and security mail fall back to the support/privacy address."""
    values = details.model_dump()
    values["complaints_email"] = values["complaints_email"] or values["support_email"]
    values["security_email"] = values["security_email"] or values["privacy_email"]
    values["information_officer_email"] = values["information_officer_email"] or values["privacy_email"]

    def sub(m: re.Match) -> str:
        key = m.group(1)
        if key not in PLACEHOLDER_LABELS:
            return m.group(0)
        return values.get(key) or f"[{PLACEHOLDER_LABELS[key]}]"

    return _TOKEN.sub(sub, text)


def unknown_tokens(text: str) -> list[str]:
    return sorted({m.group(1) for m in _TOKEN.finditer(text) if m.group(1) not in PLACEHOLDER_LABELS})
