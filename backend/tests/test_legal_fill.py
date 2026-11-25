"""Legal documents read cleanly before the company is registered: no
bracketed placeholders for missing company details."""

import re

from app.legal import catalog


def test_unregistered_company_reads_cleanly():
    details = catalog.LegalDetails()
    text = catalog.fill(catalog.template("privacy-policy"), details)
    assert "BukkaPay (a company in the process of registration)" in text
    leftovers = {m for m in re.findall(r"\[([^\]]+)\](?!\()", text)}
    labels = set(catalog.PLACEHOLDER_LABELS.values())
    assert not (leftovers & labels), leftovers & labels


def test_registered_company_details_are_used():
    details = catalog.LegalDetails(legal_name="BukkaPay (Pty) Ltd", registration_number="2026/123456/07",
                                   registered_address="1 Main Rd, Johannesburg", information_officer="T. Mokoena")
    text = catalog.fill(catalog.template("privacy-policy"), details)
    assert "BukkaPay (Pty) Ltd (registration number 2026/123456/07), trading as BukkaPay" in text
    assert "T. Mokoena" in text and "1 Main Rd, Johannesburg" in text
