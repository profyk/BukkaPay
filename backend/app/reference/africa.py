"""Africa reference data: every African Union member state (the 54 UN
members plus Western Sahara / SADR), and the recommended provider stack.

Everything here is *reference*: it makes a country known and describes it.
Nothing here makes a country available. A country opens for sign-up and
sign-in only when its readiness checklist passes (app.network.countries)
and a second admin approves the unlock.

Provider coverage below is *indicative* (vendor-published footprints,
late 2026) and is seeded as `planned`. A coverage row only counts toward a
country's readiness once an admin marks it `live` against a signed contract.
"""

from __future__ import annotations

# code: (iso3, numeric, capital, languages, mobile NSN lengths, secondary currencies, mobile money operators)
COUNTRY_DETAILS: dict[str, tuple[str, str, str, list[str], list[int], list[str], list[str]]] = {
    "DZ": ("DZA", "012", "Algiers", ["Arabic", "Tamazight"], [9], [], []),
    "AO": ("AGO", "024", "Luanda", ["Portuguese"], [9], [], ["Unitel Money", "Afrimoney"]),
    "BJ": ("BEN", "204", "Porto-Novo", ["French"], [10], [], ["MTN MoMo", "Moov Money", "Celtiis Cash"]),
    "BW": ("BWA", "072", "Gaborone", ["English", "Setswana"], [8], [], ["Orange Money", "MyZaka", "Smega"]),
    "BF": ("BFA", "854", "Ouagadougou", ["French", "Mooré", "Dyula"], [8], [], ["Orange Money", "Moov Money", "Wave"]),
    "BI": ("BDI", "108", "Gitega", ["Kirundi", "French", "English"], [8], [], ["Lumicash", "EcoCash"]),
    "CV": ("CPV", "132", "Praia", ["Portuguese"], [7], [], []),
    "CM": ("CMR", "120", "Yaoundé", ["French", "English"], [9], [], ["MTN MoMo", "Orange Money"]),
    "CF": ("CAF", "140", "Bangui", ["French", "Sango"], [8], [], ["Orange Money"]),
    "TD": ("TCD", "148", "N'Djamena", ["French", "Arabic"], [8], [], ["Airtel Money", "Moov Money"]),
    "KM": ("COM", "174", "Moroni", ["Comorian", "Arabic", "French"], [7], [], ["Huri Money", "MVola"]),
    "CG": ("COG", "178", "Brazzaville", ["French"], [9], [], ["MTN MoMo", "Airtel Money"]),
    "CD": ("COD", "180", "Kinshasa", ["French"], [9], ["USD"], ["M-Pesa", "Airtel Money", "Orange Money", "Afrimoney"]),
    "DJ": ("DJI", "262", "Djibouti", ["French", "Arabic"], [8], [], ["D-Money", "Waafi"]),
    "EG": ("EGY", "818", "Cairo", ["Arabic"], [10], [], ["Vodafone Cash", "Orange Cash", "e& Cash"]),
    "GQ": ("GNQ", "226", "Malabo", ["Spanish", "French", "Portuguese"], [9], [], []),
    "ER": ("ERI", "232", "Asmara", ["Tigrinya", "Arabic", "English"], [7], [], []),
    "SZ": ("SWZ", "748", "Mbabane", ["English", "Swazi"], [8], ["ZAR"], ["MTN MoMo"]),
    "ET": ("ETH", "231", "Addis Ababa", ["Amharic", "Afaan Oromo"], [9], [], ["Telebirr", "M-Pesa"]),
    "GA": ("GAB", "266", "Libreville", ["French"], [8, 9], [], ["Airtel Money", "Moov Money"]),
    "GM": ("GMB", "270", "Banjul", ["English"], [7], [], ["Wave", "Africell Money", "QMoney"]),
    "GH": ("GHA", "288", "Accra", ["English"], [9], [], ["MTN MoMo", "Telecel Cash", "AT Money"]),
    "GN": ("GIN", "324", "Conakry", ["French"], [9], [], ["Orange Money", "MTN MoMo"]),
    "GW": ("GNB", "624", "Bissau", ["Portuguese"], [9], [], ["Orange Money", "MTN MoMo"]),
    "CI": ("CIV", "384", "Yamoussoukro", ["French"], [10], [], ["Orange Money", "MTN MoMo", "Moov Money", "Wave"]),
    "KE": ("KEN", "404", "Nairobi", ["English", "Swahili"], [9], [], ["M-Pesa", "Airtel Money", "T-Kash"]),
    "LS": ("LSO", "426", "Maseru", ["Sesotho", "English"], [8], ["ZAR"], ["M-Pesa", "EcoCash"]),
    "LR": ("LBR", "430", "Monrovia", ["English"], [7, 8, 9], ["USD"], ["Orange Money", "MTN MoMo"]),
    "LY": ("LBY", "434", "Tripoli", ["Arabic"], [9], [], []),
    "MG": ("MDG", "450", "Antananarivo", ["Malagasy", "French"], [9], [], ["MVola", "Orange Money", "Airtel Money"]),
    "MW": ("MWI", "454", "Lilongwe", ["English", "Chichewa"], [9], [], ["Airtel Money", "TNM Mpamba"]),
    "ML": ("MLI", "466", "Bamako", ["Bambara", "French"], [8], [], ["Orange Money", "Moov Money", "Wave"]),
    "MR": ("MRT", "478", "Nouakchott", ["Arabic"], [8], [], ["Bankily", "Masrvi", "Sedad"]),
    "MU": ("MUS", "480", "Port Louis", ["English", "French"], [8], [], ["my.t money"]),
    "MA": ("MAR", "504", "Rabat", ["Arabic", "Tamazight"], [9], [], []),
    "MZ": ("MOZ", "508", "Maputo", ["Portuguese"], [9], [], ["M-Pesa", "e-Mola", "mKesh"]),
    "NA": ("NAM", "516", "Windhoek", ["English"], [9], ["ZAR"], []),
    "NE": ("NER", "562", "Niamey", ["Hausa", "French"], [8], [], ["Airtel Money", "Moov Money"]),
    "NG": ("NGA", "566", "Abuja", ["English"], [10], [], ["OPay", "PalmPay", "MoMo PSB", "Moniepoint"]),
    "RW": ("RWA", "646", "Kigali", ["Kinyarwanda", "English", "French", "Swahili"], [9], [], ["MTN MoMo", "Airtel Money"]),
    "ST": ("STP", "678", "São Tomé", ["Portuguese"], [7], [], []),
    "SN": ("SEN", "686", "Dakar", ["French"], [9], [], ["Wave", "Orange Money", "Free Money"]),
    "SC": ("SYC", "690", "Victoria", ["English", "French", "Seychellois Creole"], [7], [], ["Airtel Money"]),
    "SL": ("SLE", "694", "Freetown", ["English"], [8], [], ["Orange Money", "Africell Money"]),
    "SO": ("SOM", "706", "Mogadishu", ["Somali", "Arabic"], [8, 9], ["USD"], ["EVC Plus", "Zaad", "Sahal"]),
    "ZA": ("ZAF", "710", "Pretoria", ["English", "isiZulu", "isiXhosa", "Afrikaans"], [9], [], []),
    "SS": ("SSD", "728", "Juba", ["English"], [9], [], ["m-Gurush", "MTN MoMo"]),
    "SD": ("SDN", "729", "Khartoum", ["Arabic", "English"], [9], [], []),
    "TZ": ("TZA", "834", "Dodoma", ["Swahili", "English"], [9], [], ["M-Pesa", "Mixx by Yas", "Airtel Money", "HaloPesa"]),
    "TG": ("TGO", "768", "Lomé", ["French"], [8], [], ["Flooz", "T-Money"]),
    "TN": ("TUN", "788", "Tunis", ["Arabic"], [8], [], []),
    "UG": ("UGA", "800", "Kampala", ["English", "Swahili"], [9], [], ["MTN MoMo", "Airtel Money"]),
    "ZM": ("ZMB", "894", "Lusaka", ["English"], [9], [], ["MTN MoMo", "Airtel Money", "Zamtel Kwacha"]),
    "ZW": ("ZWE", "716", "Harare", ["English", "Shona", "Ndebele"], [9], ["USD"], ["EcoCash", "OneMoney", "InnBucks"]),
    "EH": ("ESH", "732", "Laayoune", ["Arabic", "Spanish"], [9], [], []),
}

# Countries not in the original seed (app.reference.seed.COUNTRIES).
NEW_COUNTRIES: list[tuple[str, str, str, str, str]] = [
    ("EH", "Western Sahara", "Africa", "+212", "MAD"),
]

AFRICA = tuple(COUNTRY_DETAILS)

REGIONAL_BLOCS: dict[str, tuple[str, list[str]]] = {
    "AU": ("African Union / AfCFTA", list(AFRICA)),
    "SADC": ("Southern African Development Community",
             ["AO", "BW", "KM", "CD", "SZ", "LS", "MG", "MW", "MU", "MZ", "NA", "SC", "ZA", "TZ", "ZM", "ZW"]),
    "SACU": ("Southern African Customs Union", ["BW", "LS", "NA", "ZA", "SZ"]),
    "CMA": ("Common Monetary Area (rand)", ["LS", "NA", "ZA", "SZ"]),
    "ECOWAS": ("Economic Community of West African States",
               ["BJ", "CV", "GM", "GH", "GN", "GW", "CI", "LR", "NG", "SN", "SL", "TG"]),
    "AES": ("Alliance of Sahel States", ["BF", "ML", "NE"]),
    "WAEMU": ("West African Economic and Monetary Union (XOF)", ["BJ", "BF", "CI", "GW", "ML", "NE", "SN", "TG"]),
    "CEMAC": ("Central African Economic and Monetary Community (XAF)", ["CM", "CF", "TD", "CG", "GQ", "GA"]),
    "ECCAS": ("Economic Community of Central African States",
              ["AO", "BI", "CM", "CF", "TD", "CD", "CG", "GQ", "GA", "RW", "ST"]),
    "EAC": ("East African Community", ["BI", "CD", "KE", "RW", "SS", "TZ", "UG", "SO"]),
    "COMESA": ("Common Market for Eastern and Southern Africa",
               ["BI", "KM", "CD", "DJ", "EG", "ER", "SZ", "ET", "KE", "LY", "MG", "MW", "MU", "RW", "SC", "SO",
                "SD", "TN", "UG", "ZM", "ZW"]),
    "IGAD": ("Intergovernmental Authority on Development", ["DJ", "ER", "ET", "KE", "SO", "SS", "SD", "UG"]),
    "AMU": ("Arab Maghreb Union", ["DZ", "LY", "MR", "MA", "TN"]),
}

CURRENCY_PEGS: dict[str, str] = {
    "XOF": "EUR (1 EUR = 655.957 XOF)", "XAF": "EUR (1 EUR = 655.957 XAF)", "KMF": "EUR (1 EUR = 491.968 KMF)",
    "CVE": "EUR (1 EUR = 110.265 CVE)", "STN": "EUR (1 EUR = 24.5 STN)",
    "LSL": "ZAR 1:1", "NAD": "ZAR 1:1", "SZL": "ZAR 1:1",
    "DJF": "USD (1 USD = 177.721 DJF)", "ERN": "USD (1 USD = 15 ERN)",
}


def blocs_for(code: str) -> list[str]:
    return [k for k, (_, members) in REGIONAL_BLOCS.items() if code in members]


def details(code: str) -> dict:
    iso3, numeric, capital, languages, nsn, secondary, momo = COUNTRY_DETAILS[code]
    return {"iso3": iso3, "numeric_code": numeric, "capital": capital, "languages": languages,
            "phone_nsn_lengths": nsn, "secondary_currencies": secondary, "mobile_money_operators": momo,
            "regional_blocs": blocs_for(code)}


# ─── provider stack ─────────────────────────────────────────────────────────

# Capabilities a provider can have in a country.
CAPABILITIES = (
    "collect_bank", "collect_mobile_money", "collect_card",
    "payout_bank", "payout_mobile_money",
    "cross_border", "card_issuing", "kyc", "custody",
)
COLLECT = ("collect_bank", "collect_mobile_money", "collect_card")
PAYOUT = ("payout_bank", "payout_mobile_money")

_SSA_ONAFRIQ = ["BJ", "BF", "BI", "BW", "CM", "TD", "CG", "CD", "CI", "DJ", "EG", "ET", "GA", "GM", "GH", "GN",
                "GW", "KE", "LS", "LR", "MG", "MW", "ML", "MA", "MR", "MZ", "NA", "NE", "NG", "RW", "SN", "SL",
                "ZA", "SZ", "TZ", "TG", "TN", "UG", "ZM", "ZW"]
_PAWAPAY = ["BJ", "BF", "CM", "CG", "CD", "GA", "GH", "CI", "KE", "LS", "MW", "MZ", "NG", "RW", "SN", "SL", "TZ",
            "UG", "ZM"]
_PAPSS = ["NG", "GH", "GM", "GN", "LR", "SL", "KE", "RW", "ZM", "MW", "ZW", "DJ", "TN", "KM", "ET",
          "CM", "CF", "TD", "CG", "GQ", "GA"]
_ECOBANK = ["BJ", "BF", "BI", "CM", "CF", "TD", "CG", "CD", "CI", "GQ", "GA", "GM", "GH", "GN", "GW", "KE", "LR",
            "MW", "ML", "NE", "NG", "RW", "ST", "SN", "SL", "SS", "TZ", "TG", "UG", "ZM", "ZW"]

# The recommended stack, cheapest-and-widest first. `coverage` maps
# capability -> countries (indicative; seeded as `planned`).
PROVIDER_CATALOGUE: list[dict] = [
    {
        "code": "onafriq", "name": "Onafriq (pan-African payments & card programmes)", "provider_type": "network",
        "role": "Primary rail: one integration for mobile-money and bank collections/payouts and card programmes",
        "why": "Widest single footprint (~43 African markets, ~1bn wallets, ~500m bank accounts, 2,000+ "
               "corridors) and offers card issuing with BIN sponsorship, so one contract can cover rails and "
               "cards in most launch markets. Adapter already built (app/payouts/onafriq.py).",
        "cost": "Per-transaction, volume-tiered; negotiate country bundles. Cheaper than stacking local PSPs.",
        "coverage": {"collect_mobile_money": _SSA_ONAFRIQ, "payout_mobile_money": _SSA_ONAFRIQ,
                     "payout_bank": _SSA_ONAFRIQ, "cross_border": _SSA_ONAFRIQ, "card_issuing": _SSA_ONAFRIQ},
    },
    {
        "code": "pawapay", "name": "pawaPay (mobile money, direct to operators)", "provider_type": "mobile_money",
        "role": "Low-cost mobile-money collections and payouts; failover for Onafriq",
        "why": "Direct connections to ~50 operators in ~20 markets through one API; typically the cheapest way "
               "to collect from and pay out to mobile wallets where it operates. Licensed PSP (e.g. Mozambique).",
        "cost": "Low per-transaction mobile-money fees; no card or bank rails.",
        "coverage": {"collect_mobile_money": _PAWAPAY, "payout_mobile_money": _PAWAPAY},
    },
    {
        "code": "papss", "name": "PAPSS (Pan-African Payment and Settlement System)", "provider_type": "network",
        "role": "Cheapest intra-African cross-border settlement in local currencies",
        "why": "Central-bank settlement in local currency (no USD leg); 28 countries incl. all of CEMAC since "
               "July 2026; WAEMU/BCEAO in pilot. Joined through a participant bank (e.g. the custodian bank).",
        "cost": "Lowest FX/settlement cost for African corridors; access via a participant bank.",
        "coverage": {"cross_border": _PAPSS},
    },
    {
        "code": "tcib", "name": "TCIB (SADC Transactions Cleared on an Immediate Basis)", "provider_type": "network",
        "role": "Low-cost instant cross-border within SADC",
        "why": "SADC regional instant rail operated through participating banks; cheap for ZA-ZW-BW-NA-LS-SZ-MZ.",
        "cost": "Low; access via a participating bank.",
        "coverage": {"cross_border": REGIONAL_BLOCS["SADC"][1]},
    },
    {
        "code": "smile_id", "name": "Smile ID (identity verification)", "provider_type": "kyc",
        "role": "KYC: document and biometric checks",
        "why": "Document verification in all 54 African countries with 3+ ID types in most markets; "
               "government database checks in key markets. Keys already supported (SMILE_ID_API_KEY).",
        "cost": "Per check; cheapest document+selfie coverage for Africa.",
        "coverage": {"kyc": list(AFRICA)},
    },
    {
        "code": "paymentology", "name": "Paymentology (card issuer processor)", "provider_type": "card",
        "role": "Visa card processing for the one-card-per-customer programme",
        "why": "Global issuer processor already integrated (app/cards/paymentology.py). Needs a BIN sponsor per "
               "region: use Onafriq's sponsored programmes or the custodian bank.",
        "cost": "Per active card + per transaction.",
        "coverage": {},
    },
    {
        "code": "ecobank", "name": "Ecobank (pan-African safeguarding bank)", "provider_type": "bank",
        "role": "Custodian / safeguarding bank and PAPSS participant",
        "why": "One banking group in ~33 African countries: one relationship for segregated safeguarding "
               "accounts, local settlement accounts and PAPSS access. Use Standard Bank/Stanbic in southern "
               "Africa where Ecobank is absent (e.g. ZA, BW, NA, LS, SZ, MZ, AO).",
        "cost": "Account and transfer fees; negotiate group-wide.",
        "coverage": {"custody": _ECOBANK},
    },
]
