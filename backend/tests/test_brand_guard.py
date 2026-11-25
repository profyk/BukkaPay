"""Public pages can't impersonate banks/brands or use phishing wording."""

import pytest

from app.core import brand_guard
from app.core.errors import ApiError


@pytest.mark.parametrize("text", ["FNB Security", "SARS refund", "Capitec", "M-Pesa payments", "BukkaPay Support",
                                  "Verify your account", "Your account suspended", "Claim your refund"])
def test_refused(text):
    with pytest.raises(ApiError):
        brand_guard.check(text)


@pytest.mark.parametrize("text", ["Mma Spaza", "Gabs Wholesale", "Thandi's Kota", "Visagie Plumbing",
                                  "Absalom Traders", "Chart Shop", None, ""])
def test_allowed(text):
    brand_guard.check(text)  # no error; whole-word matching avoids false hits (Visagie, Absalom)
