"""Reference data seeded by migration 0017 (and the test fixtures).

Seeding a country or currency makes it *known*, never *available*: every
country starts `planned` and every new currency starts with wallets
disabled. South Africa starts as `pilot` because BukkaPay already operates
there (existing ZAR wallets, Stitch EFT) — its custodian and compliance
sign-off still have to be recorded before it can be marked `live`.
"""

# code, name, symbol, decimals
EXTRA_CURRENCIES: list[tuple[str, str, str, int]] = [
    ("DZD", "Algerian Dinar", "DA", 2), ("AOA", "Angolan Kwanza", "Kz", 2),
    ("XOF", "West African CFA Franc", "CFA", 0), ("XAF", "Central African CFA Franc", "FCFA", 0),
    ("BIF", "Burundian Franc", "FBu", 0), ("CVE", "Cape Verdean Escudo", "Esc", 2),
    ("KMF", "Comorian Franc", "CF", 0), ("CDF", "Congolese Franc", "FC", 2),
    ("DJF", "Djiboutian Franc", "Fdj", 0), ("ERN", "Eritrean Nakfa", "Nfk", 2),
    ("SZL", "Swazi Lilangeni", "E", 2), ("ETB", "Ethiopian Birr", "Br", 2),
    ("GMD", "Gambian Dalasi", "D", 2), ("GNF", "Guinean Franc", "FG", 0),
    ("LSL", "Lesotho Loti", "L", 2), ("LRD", "Liberian Dollar", "L$", 2),
    ("LYD", "Libyan Dinar", "LD", 3), ("MGA", "Malagasy Ariary", "Ar", 2),
    ("MWK", "Malawian Kwacha", "MK", 2), ("MRU", "Mauritanian Ouguiya", "UM", 2),
    ("MUR", "Mauritian Rupee", "Rs", 2), ("MAD", "Moroccan Dirham", "DH", 2),
    ("MZN", "Mozambican Metical", "MT", 2), ("NAD", "Namibian Dollar", "N$", 2),
    ("RWF", "Rwandan Franc", "FRw", 0), ("STN", "São Tomé and Príncipe Dobra", "Db", 2),
    ("SCR", "Seychellois Rupee", "SR", 2), ("SLE", "Sierra Leonean Leone", "Le", 2),
    ("SOS", "Somali Shilling", "Sh", 2), ("SSP", "South Sudanese Pound", "SSP", 2),
    ("SDG", "Sudanese Pound", "LS", 2), ("TZS", "Tanzanian Shilling", "TSh", 2),
    ("TND", "Tunisian Dinar", "DT", 3), ("UGX", "Ugandan Shilling", "USh", 0),
    ("CAD", "Canadian Dollar", "C$", 2), ("BRL", "Brazilian Real", "R$", 2),
    ("MXN", "Mexican Peso", "Mex$", 2), ("CHF", "Swiss Franc", "Fr", 2),
    ("NOK", "Norwegian Krone", "kr", 2), ("PLN", "Polish Złoty", "zł", 2),
    ("TRY", "Turkish Lira", "₺", 2), ("AED", "UAE Dirham", "AED", 2),
    ("SAR", "Saudi Riyal", "SR", 2), ("QAR", "Qatari Riyal", "QR", 2),
    ("KWD", "Kuwaiti Dinar", "KD", 3), ("ILS", "Israeli New Shekel", "₪", 2),
    ("INR", "Indian Rupee", "₹", 2), ("CNY", "Chinese Yuan", "¥", 2),
    ("PKR", "Pakistani Rupee", "Rs", 2), ("PHP", "Philippine Peso", "₱", 2),
    ("MYR", "Malaysian Ringgit", "RM", 2), ("SGD", "Singapore Dollar", "S$", 2),
    ("JPY", "Japanese Yen", "¥", 0), ("KRW", "South Korean Won", "₩", 0),
    ("IDR", "Indonesian Rupiah", "Rp", 2), ("VND", "Vietnamese Đồng", "₫", 0),
    ("THB", "Thai Baht", "฿", 2), ("BDT", "Bangladeshi Taka", "৳", 2),
    ("LKR", "Sri Lankan Rupee", "Rs", 2), ("AUD", "Australian Dollar", "A$", 2),
    ("NZD", "New Zealand Dollar", "NZ$", 2),
]

# code, name, region, dial code, currency
COUNTRIES: list[tuple[str, str, str, str, str]] = [
    ("DZ", "Algeria", "Africa", "+213", "DZD"), ("AO", "Angola", "Africa", "+244", "AOA"),
    ("BJ", "Benin", "Africa", "+229", "XOF"), ("BW", "Botswana", "Africa", "+267", "BWP"),
    ("BF", "Burkina Faso", "Africa", "+226", "XOF"), ("BI", "Burundi", "Africa", "+257", "BIF"),
    ("CV", "Cabo Verde", "Africa", "+238", "CVE"), ("CM", "Cameroon", "Africa", "+237", "XAF"),
    ("CF", "Central African Republic", "Africa", "+236", "XAF"), ("TD", "Chad", "Africa", "+235", "XAF"),
    ("KM", "Comoros", "Africa", "+269", "KMF"), ("CG", "Congo, Republic of", "Africa", "+242", "XAF"),
    ("CD", "Congo, DR", "Africa", "+243", "CDF"), ("DJ", "Djibouti", "Africa", "+253", "DJF"),
    ("EG", "Egypt", "Africa", "+20", "EGP"), ("GQ", "Equatorial Guinea", "Africa", "+240", "XAF"),
    ("ER", "Eritrea", "Africa", "+291", "ERN"), ("SZ", "Eswatini", "Africa", "+268", "SZL"),
    ("ET", "Ethiopia", "Africa", "+251", "ETB"), ("GA", "Gabon", "Africa", "+241", "XAF"),
    ("GM", "Gambia", "Africa", "+220", "GMD"), ("GH", "Ghana", "Africa", "+233", "GHS"),
    ("GN", "Guinea", "Africa", "+224", "GNF"), ("GW", "Guinea-Bissau", "Africa", "+245", "XOF"),
    ("CI", "Côte d'Ivoire", "Africa", "+225", "XOF"), ("KE", "Kenya", "Africa", "+254", "KES"),
    ("LS", "Lesotho", "Africa", "+266", "LSL"), ("LR", "Liberia", "Africa", "+231", "LRD"),
    ("LY", "Libya", "Africa", "+218", "LYD"), ("MG", "Madagascar", "Africa", "+261", "MGA"),
    ("MW", "Malawi", "Africa", "+265", "MWK"), ("ML", "Mali", "Africa", "+223", "XOF"),
    ("MR", "Mauritania", "Africa", "+222", "MRU"), ("MU", "Mauritius", "Africa", "+230", "MUR"),
    ("MA", "Morocco", "Africa", "+212", "MAD"), ("MZ", "Mozambique", "Africa", "+258", "MZN"),
    ("NA", "Namibia", "Africa", "+264", "NAD"), ("NE", "Niger", "Africa", "+227", "XOF"),
    ("NG", "Nigeria", "Africa", "+234", "NGN"), ("RW", "Rwanda", "Africa", "+250", "RWF"),
    ("ST", "São Tomé and Príncipe", "Africa", "+239", "STN"), ("SN", "Senegal", "Africa", "+221", "XOF"),
    ("SC", "Seychelles", "Africa", "+248", "SCR"), ("SL", "Sierra Leone", "Africa", "+232", "SLE"),
    ("SO", "Somalia", "Africa", "+252", "SOS"), ("ZA", "South Africa", "Africa", "+27", "ZAR"),
    ("SS", "South Sudan", "Africa", "+211", "SSP"), ("SD", "Sudan", "Africa", "+249", "SDG"),
    ("TZ", "Tanzania", "Africa", "+255", "TZS"), ("TG", "Togo", "Africa", "+228", "XOF"),
    ("TN", "Tunisia", "Africa", "+216", "TND"), ("UG", "Uganda", "Africa", "+256", "UGX"),
    ("ZM", "Zambia", "Africa", "+260", "ZMW"), ("ZW", "Zimbabwe", "Africa", "+263", "ZWG"),
    ("US", "United States", "Americas", "+1", "USD"), ("CA", "Canada", "Americas", "+1", "CAD"),
    ("BR", "Brazil", "Americas", "+55", "BRL"), ("MX", "Mexico", "Americas", "+52", "MXN"),
    ("GB", "United Kingdom", "Europe", "+44", "GBP"), ("DE", "Germany", "Europe", "+49", "EUR"),
    ("FR", "France", "Europe", "+33", "EUR"), ("NL", "Netherlands", "Europe", "+31", "EUR"),
    ("IT", "Italy", "Europe", "+39", "EUR"), ("ES", "Spain", "Europe", "+34", "EUR"),
    ("PT", "Portugal", "Europe", "+351", "EUR"), ("IE", "Ireland", "Europe", "+353", "EUR"),
    ("BE", "Belgium", "Europe", "+32", "EUR"), ("AT", "Austria", "Europe", "+43", "EUR"),
    ("GR", "Greece", "Europe", "+30", "EUR"), ("FI", "Finland", "Europe", "+358", "EUR"),
    ("CH", "Switzerland", "Europe", "+41", "CHF"), ("NO", "Norway", "Europe", "+47", "NOK"),
    ("PL", "Poland", "Europe", "+48", "PLN"), ("TR", "Turkey", "Europe", "+90", "TRY"),
    ("AE", "United Arab Emirates", "Middle East", "+971", "AED"),
    ("SA", "Saudi Arabia", "Middle East", "+966", "SAR"), ("QA", "Qatar", "Middle East", "+974", "QAR"),
    ("KW", "Kuwait", "Middle East", "+965", "KWD"), ("IL", "Israel", "Middle East", "+972", "ILS"),
    ("IN", "India", "Asia", "+91", "INR"), ("CN", "China", "Asia", "+86", "CNY"),
    ("PK", "Pakistan", "Asia", "+92", "PKR"), ("PH", "Philippines", "Asia", "+63", "PHP"),
    ("MY", "Malaysia", "Asia", "+60", "MYR"), ("SG", "Singapore", "Asia", "+65", "SGD"),
    ("JP", "Japan", "Asia", "+81", "JPY"), ("KR", "South Korea", "Asia", "+82", "KRW"),
    ("ID", "Indonesia", "Asia", "+62", "IDR"), ("VN", "Vietnam", "Asia", "+84", "VND"),
    ("TH", "Thailand", "Asia", "+66", "THB"), ("BD", "Bangladesh", "Asia", "+880", "BDT"),
    ("LK", "Sri Lanka", "Asia", "+94", "LKR"), ("AU", "Australia", "Oceania", "+61", "AUD"),
    ("NZ", "New Zealand", "Oceania", "+64", "NZD"),
]

PILOT_COUNTRIES = {"ZA"}

# Providers known to the platform. Status reflects what is wired today.
PROVIDERS: list[dict] = [
    {"code": "stitch", "name": "Stitch (instant EFT & payouts)", "provider_type": "psp", "country_code": "ZA",
     "currencies": ["ZAR"], "methods": ["eft_payin", "bank_payout"], "mode": "production", "status": "active",
     "credentials_ref": "STITCH_CLIENT_ID/STITCH_CLIENT_SECRET"},
    {"code": "sandbox", "name": "BukkaPay Sandbox Rail (simulated, no real money)", "provider_type": "network",
     "country_code": None, "currencies": [], "methods": ["cross_border"], "mode": "sandbox", "status": "active",
     "credentials_ref": "SANDBOX_WEBHOOK_SECRET"},
    {"code": "papss", "name": "PAPSS (Pan-African Payment and Settlement System)", "provider_type": "network",
     "country_code": None, "currencies": [], "methods": ["cross_border"], "mode": "sandbox", "status": "inactive",
     "credentials_ref": None},
]

# The spec's example corridors — created as drafts, not enabled.
DRAFT_CORRIDORS: list[tuple[str, str, str, str]] = [
    ("ZW", "ZA", "ZWG", "ZAR"), ("ZA", "ZW", "ZAR", "ZWG"),
    ("NG", "KE", "NGN", "KES"), ("KE", "NG", "KES", "NGN"),
]

# Fee rules carried over from the admin "Platform Pricing" defaults.
# Fixed amounts are currency-specific, so those rules are scoped to ZAR/ZA;
# percentage-only rules apply in any currency.
# product, percentage, fixed, currency, country
FEES: list[tuple[str, str, str, str | None, str | None]] = [
    ("p2p", "0.5", "1.00", "ZAR", "ZA"),
    ("p2p", "0.5", "0", None, None),
    ("cross_border", "1.0", "0", None, None),
    ("payment_link", "1.5", "0", None, None),
    ("merchant_payment", "1.5", "0", None, None),
    ("withdrawal", "0", "8.50", "ZAR", "ZA"),
    ("card_issuance", "0", "50.00", "ZAR", "ZA"),
    ("card_maintenance", "0", "15.00", "ZAR", "ZA"),
]

# product, kyc_level, per_txn_min, per_txn_max, daily_max, monthly_max (ZAR, ZA)
LIMITS: list[tuple[str, int, str, str | None, str | None, str | None]] = [
    ("p2p", 0, "10", "1000", "3000", "10000"),
    ("p2p", 1, "10", "5000", "10000", "25000"),
    ("p2p", 2, "10", "50000", "100000", "500000"),
    ("withdrawal", 0, "50", "0", "0", "0"),
    ("withdrawal", 1, "50", "5000", "10000", "25000"),
    ("withdrawal", 2, "50", "25000", "50000", "250000"),
    ("funding", 0, "10", "1000", "3000", "10000"),
    ("funding", 1, "10", "10000", "20000", "50000"),
    ("funding", 2, "10", "100000", "200000", "1000000"),
    ("cross_border", 0, "10", "0", "0", "0"),
    ("cross_border", 1, "10", "0", "0", "0"),
    ("cross_border", 2, "10", "20000", "50000", "200000"),
    # Individual sellers (no business KYB): what they may collect.
    ("merchant_individual", 2, "1", "5000", "10000", "25000"),
]
