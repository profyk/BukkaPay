"""Idempotent SQL that loads app.reference.africa: used by migration 0037 (sync
connection) and the test/dev bootstrap (async connection). Every statement is
safe to re-run: inserts skip existing rows, updates only fill reference
columns. Nothing here changes a country's status or makes it available."""

from __future__ import annotations

import json

from sqlalchemy import text

from app.reference import africa, seed

_DEFAULT_CCY = {code: ccy for code, _, _, _, ccy in seed.COUNTRIES + africa.NEW_COUNTRIES}

# Existing, wired providers whose real coverage is known.
LIVE_COVERAGE = [
    ("stitch", "ZA", ["collect_bank", "payout_bank"], "Instant EFT pay-ins and bank payouts (production)."),
]


def statements() -> list[tuple]:
    out: list[tuple] = []
    for code, name, region, dial, ccy in africa.NEW_COUNTRIES:
        out.append((text(
            "INSERT INTO countries (code, name, region, dial_code, default_currency, status, compliance_approved, "
            "custodian_ready, provider_ready, kyc_requirements) VALUES (:code, :name, :region, :dial, :ccy, "
            "'planned', false, false, false, CAST(:kyc AS jsonb)) ON CONFLICT (code) DO NOTHING"),
            {"code": code, "name": name, "region": region, "dial": dial, "ccy": ccy,
             "kyc": json.dumps({"wallet": 1, "cross_border": 2})}))
        out.append((text("INSERT INTO country_currencies (country_code, currency_code, wallet_enabled) "
                         "VALUES (:c, :ccy, false) ON CONFLICT DO NOTHING"), {"c": code, "ccy": ccy}))

    for code in africa.AFRICA:
        d = africa.details(code)
        out.append((text(
            "UPDATE countries SET iso3 = :iso3, numeric_code = :numeric_code, capital = :capital, "
            "languages = CAST(:languages AS jsonb), regional_blocs = CAST(:regional_blocs AS jsonb), "
            "phone_nsn_lengths = CAST(:phone_nsn_lengths AS jsonb), "
            "secondary_currencies = CAST(:secondary_currencies AS jsonb), "
            "mobile_money_operators = CAST(:mobile_money_operators AS jsonb) WHERE code = :code"),
            {"code": code, "iso3": d["iso3"], "numeric_code": d["numeric_code"], "capital": d["capital"],
             **{k: json.dumps(d[k]) for k in ("languages", "regional_blocs", "phone_nsn_lengths",
                                              "secondary_currencies", "mobile_money_operators")}}))
        for ccy in d["secondary_currencies"]:
            out.append((text("INSERT INTO country_currencies (country_code, currency_code, wallet_enabled) "
                             "VALUES (:c, :ccy, false) ON CONFLICT DO NOTHING"), {"c": code, "ccy": ccy}))

    for p in africa.PROVIDER_CATALOGUE:
        caps = sorted({c for c in p["coverage"]})
        out.append((text(
            "INSERT INTO payment_providers (code, name, provider_type, country_code, currencies, methods, mode, "
            "status, webhook_status, limits, credentials_ref) VALUES (:code, :name, :type, NULL, "
            "CAST('[]' AS jsonb), CAST(:methods AS jsonb), 'sandbox', 'inactive', 'not_configured', "
            "CAST('{}' AS jsonb), NULL) ON CONFLICT (code) DO NOTHING"),
            {"code": p["code"], "name": p["name"], "type": p["provider_type"], "methods": json.dumps(caps)}))
        by_country: dict[str, list[str]] = {}
        for cap, countries in p["coverage"].items():
            for c in countries:
                by_country.setdefault(c, []).append(cap)
        for country, cap_list in sorted(by_country.items()):
            out.append((_coverage_sql("planned"),
                        {"code": p["code"], "cc": country, "caps": json.dumps(sorted(cap_list)),
                         "curs": json.dumps([_DEFAULT_CCY[country]]),
                         "notes": "Indicative vendor footprint - confirm against the signed contract."}))

    for code, country, caps, notes in LIVE_COVERAGE:
        out.append((_coverage_sql("live"), {"code": code, "cc": country, "caps": json.dumps(caps),
                                            "curs": json.dumps([_DEFAULT_CCY[country]]), "notes": notes}))
    return out


def _coverage_sql(status: str):
    return text(
        "INSERT INTO provider_countries (provider_id, country_code, capabilities, currencies, status, notes) "
        f"SELECT p.id, :cc, CAST(:caps AS jsonb), CAST(:curs AS jsonb), '{status}', :notes "
        "FROM payment_providers p WHERE p.code = :code ON CONFLICT (provider_id, country_code) DO NOTHING")
