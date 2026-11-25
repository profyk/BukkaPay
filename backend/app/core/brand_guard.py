"""Stops BukkaPay pages being used for phishing.

Payment links, claims, trade invoices and business profiles are public pages
on our domain. A scammer naming one "FNB Security" or "SARS Refund" turns it
into a phishing page that Google Safe Browsing then flags for the whole
domain. Names and descriptions that impersonate banks, mobile-money brands,
tax authorities, big tech or BukkaPay itself, or that use classic phishing
wording, are refused before the page exists.
"""

from __future__ import annotations

import re

from app.core.errors import ApiError

# Lower-case, matched as whole words.
PROTECTED = [
    # BukkaPay itself
    "bukkapay", "bukka pay",
    # South Africa and pan-African banks
    "absa", "fnb", "first national bank", "standard bank", "stanbic", "nedbank", "capitec", "investec",
    "african bank", "tymebank", "tyme bank", "discovery bank", "ecobank", "equity bank", "kcb", "gtbank",
    "guaranty trust", "access bank", "zenith bank", "first bank", "uba", "fidelity bank", "cbz", "stanchart",
    "standard chartered", "barclays", "old mutual", "sanlam", "postbank",
    # Mobile money and payments
    "m-pesa", "mpesa", "ecocash", "airtel money", "orange money", "mtn momo", "vodacom", "vodapay",
    "telkom", "paypal", "visa", "mastercard", "western union", "moneygram", "payoneer",
    "onafriq", "pawapay", "flutterwave", "paystack", "yoco", "snapscan", "zapper",
    # Government and tax
    "sars", "south african revenue", "revenue service", "home affairs", "sassa", "nsfas", "kra", "firs",
    "zimra", "burs", "police", "saps", "interpol",
    # Big tech
    "google", "apple id", "apple pay", "microsoft", "amazon", "netflix", "facebook", "whatsapp", "instagram", "tiktok",
]
PHISHING_WORDS = [
    r"verify your (account|identity|card)", r"account (suspended|locked|blocked)", r"security (alert|department|team)",
    r"refund department", r"unlock your account", r"confirm your (pin|password|otp|card)", r"update your (bank|card) details",
    r"(otp|one[- ]time pin|pin) required", r"claim your (prize|winnings|refund)", r"you have won",
]

_BRAND_RE = re.compile(r"\b(" + "|".join(re.escape(b) for b in sorted(PROTECTED, key=len, reverse=True)) + r")\b", re.I)
_PHISH_RE = re.compile("|".join(PHISHING_WORDS), re.I)


def problem(text: str | None) -> str | None:
    if not text:
        return None
    if m := _PHISH_RE.search(text):
        return f'"{m.group(0)}" looks like a scam message'
    if m := _BRAND_RE.search(text):
        return f'"{m.group(0)}" is a protected name'
    return None


def check(*texts: str | None, what: str = "name") -> None:
    """Refuse names/descriptions that impersonate a brand or read like phishing."""
    for t in texts:
        if p := problem(t):
            raise ApiError(f"This {what} can't be used: {p}. Use your own name or business name. "
                           "If you really are this organisation, contact support to be verified.")
