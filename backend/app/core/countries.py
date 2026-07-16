"""Destination country directory for Send Money's Africa/International
pickers. Backend is the trusted source for currency + zone — the mobile app
sends only a country code, and this module resolves what settlement
currency and pricing zone (`TransferZone`) it maps to, mirroring the
existing `lib/countries.ts` reference-data duplication already used
client-side (e.g. `CURRENCY_LABEL` in the admin's corridors.tsx).

Every country settles into one of BukkaPay's `WalletCurrency` values —
there's no per-country currency, since BukkaPay is a closed-loop wallet
(see wallet_service._resolve_user): sending "to Nigeria" really means
sending to a BukkaPay user who holds an NGN wallet, not a Nigerian bank
account. Countries without a named local currency default to USD, the
common cross-border settlement currency.
"""

from dataclasses import dataclass

from app.models.enums import TransferZone, WalletCurrency


@dataclass(frozen=True)
class CountryInfo:
    code: str  # ISO 3166-1 alpha-2
    name: str
    currency: str
    zone: TransferZone
    region: str


def _africa(code: str, name: str, currency: str = WalletCurrency.USD.value) -> CountryInfo:
    return CountryInfo(code=code, name=name, currency=currency, zone=TransferZone.AFRICA, region="Africa")


def _intl(code: str, name: str, region: str, currency: str = WalletCurrency.USD.value) -> CountryInfo:
    return CountryInfo(code=code, name=name, currency=currency, zone=TransferZone.INTERNATIONAL, region=region)


_AFRICA: list[CountryInfo] = [
    _africa("DZ", "Algeria"),
    _africa("AO", "Angola"),
    _africa("BJ", "Benin"),
    _africa("BW", "Botswana", WalletCurrency.BWP.value),
    _africa("BF", "Burkina Faso"),
    _africa("BI", "Burundi"),
    _africa("CV", "Cabo Verde"),
    _africa("CM", "Cameroon"),
    _africa("CF", "Central African Republic"),
    _africa("TD", "Chad"),
    _africa("KM", "Comoros"),
    _africa("CG", "Congo, Republic of"),
    _africa("CD", "Congo, DR"),
    _africa("DJ", "Djibouti"),
    _africa("EG", "Egypt"),
    _africa("GQ", "Equatorial Guinea"),
    _africa("ER", "Eritrea"),
    _africa("SZ", "Eswatini"),
    _africa("ET", "Ethiopia"),
    _africa("GA", "Gabon"),
    _africa("GM", "Gambia"),
    _africa("GH", "Ghana", WalletCurrency.GHS.value),
    _africa("GN", "Guinea"),
    _africa("GW", "Guinea-Bissau"),
    _africa("CI", "Ivory Coast"),
    _africa("KE", "Kenya", WalletCurrency.KES.value),
    _africa("LS", "Lesotho"),
    _africa("LR", "Liberia"),
    _africa("LY", "Libya"),
    _africa("MG", "Madagascar"),
    _africa("MW", "Malawi"),
    _africa("ML", "Mali"),
    _africa("MR", "Mauritania"),
    _africa("MU", "Mauritius"),
    _africa("MA", "Morocco"),
    _africa("MZ", "Mozambique"),
    _africa("NA", "Namibia"),
    _africa("NE", "Niger"),
    _africa("NG", "Nigeria", WalletCurrency.NGN.value),
    _africa("RW", "Rwanda"),
    _africa("ST", "Sao Tome and Principe"),
    _africa("SN", "Senegal"),
    _africa("SC", "Seychelles"),
    _africa("SL", "Sierra Leone"),
    _africa("SO", "Somalia"),
    _africa("ZA", "South Africa", WalletCurrency.ZAR.value),
    _africa("SS", "South Sudan"),
    _africa("SD", "Sudan"),
    _africa("TZ", "Tanzania"),
    _africa("TG", "Togo"),
    _africa("TN", "Tunisia"),
    _africa("UG", "Uganda"),
    _africa("ZM", "Zambia"),
    _africa("ZW", "Zimbabwe"),
]

_INTERNATIONAL: list[CountryInfo] = [
    # Americas
    _intl("US", "United States", "Americas"),
    _intl("CA", "Canada", "Americas"),
    _intl("BR", "Brazil", "Americas"),
    _intl("MX", "Mexico", "Americas"),
    # Europe
    _intl("GB", "United Kingdom", "Europe", WalletCurrency.GBP.value),
    _intl("DE", "Germany", "Europe", WalletCurrency.EUR.value),
    _intl("FR", "France", "Europe", WalletCurrency.EUR.value),
    _intl("NL", "Netherlands", "Europe", WalletCurrency.EUR.value),
    _intl("IT", "Italy", "Europe", WalletCurrency.EUR.value),
    _intl("ES", "Spain", "Europe", WalletCurrency.EUR.value),
    _intl("PT", "Portugal", "Europe", WalletCurrency.EUR.value),
    _intl("IE", "Ireland", "Europe", WalletCurrency.EUR.value),
    _intl("BE", "Belgium", "Europe", WalletCurrency.EUR.value),
    _intl("AT", "Austria", "Europe", WalletCurrency.EUR.value),
    _intl("GR", "Greece", "Europe", WalletCurrency.EUR.value),
    _intl("FI", "Finland", "Europe", WalletCurrency.EUR.value),
    _intl("CH", "Switzerland", "Europe"),
    _intl("NO", "Norway", "Europe"),
    _intl("PL", "Poland", "Europe"),
    _intl("TR", "Turkey", "Europe"),
    # Middle East
    _intl("AE", "United Arab Emirates", "Middle East"),
    _intl("SA", "Saudi Arabia", "Middle East"),
    _intl("QA", "Qatar", "Middle East"),
    _intl("KW", "Kuwait", "Middle East"),
    _intl("IL", "Israel", "Middle East"),
    # Asia
    _intl("IN", "India", "Asia"),
    _intl("CN", "China", "Asia"),
    _intl("PK", "Pakistan", "Asia"),
    _intl("PH", "Philippines", "Asia"),
    _intl("MY", "Malaysia", "Asia"),
    _intl("SG", "Singapore", "Asia"),
    _intl("JP", "Japan", "Asia"),
    _intl("KR", "South Korea", "Asia"),
    _intl("ID", "Indonesia", "Asia"),
    _intl("VN", "Vietnam", "Asia"),
    _intl("TH", "Thailand", "Asia"),
    _intl("BD", "Bangladesh", "Asia"),
    _intl("LK", "Sri Lanka", "Asia"),
    # Oceania
    _intl("AU", "Australia", "Oceania"),
    _intl("NZ", "New Zealand", "Oceania"),
]

COUNTRIES: dict[str, CountryInfo] = {c.code: c for c in [*_AFRICA, *_INTERNATIONAL]}


def get_country(code: str) -> CountryInfo | None:
    return COUNTRIES.get(code.upper())


def list_africa() -> list[CountryInfo]:
    return list(_AFRICA)


def list_international() -> list[CountryInfo]:
    return list(_INTERNATIONAL)
