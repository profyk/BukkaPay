import { CurrencyCode } from "./currency";

// Destination directory for Send Money's Africa/International pickers.
// Mirrors the backend's app/core/countries.py — the backend is the
// trusted source (it re-resolves the code server-side), this copy exists
// purely so the picker UI can render instantly without a round trip.
//
// Every country settles into one of BukkaPay's wallet currencies: BukkaPay
// is a closed-loop wallet (see wallet_service._resolve_user) — sending "to
// Nigeria" means sending to a BukkaPay user who holds an NGN wallet, not a
// Nigerian bank account. Countries without a named local currency default
// to USD, the common cross-border settlement currency.
export type TransferZone = "local" | "africa" | "international";

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  currency: CurrencyCode;
  zone: TransferZone;
  region: string;
}

export const AFRICA_COUNTRIES: Country[] = [
  { code: "DZ", name: "Algeria", flag: "🇩🇿", currency: "USD", zone: "africa", region: "Africa" },
  { code: "AO", name: "Angola", flag: "🇦🇴", currency: "USD", zone: "africa", region: "Africa" },
  { code: "BJ", name: "Benin", flag: "🇧🇯", currency: "USD", zone: "africa", region: "Africa" },
  { code: "BW", name: "Botswana", flag: "🇧🇼", currency: "BWP", zone: "africa", region: "Africa" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫", currency: "USD", zone: "africa", region: "Africa" },
  { code: "BI", name: "Burundi", flag: "🇧🇮", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CV", name: "Cabo Verde", flag: "🇨🇻", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CF", name: "Central African Republic", flag: "🇨🇫", currency: "USD", zone: "africa", region: "Africa" },
  { code: "TD", name: "Chad", flag: "🇹🇩", currency: "USD", zone: "africa", region: "Africa" },
  { code: "KM", name: "Comoros", flag: "🇰🇲", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CG", name: "Congo, Republic of", flag: "🇨🇬", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CD", name: "Congo, DR", flag: "🇨🇩", currency: "USD", zone: "africa", region: "Africa" },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯", currency: "USD", zone: "africa", region: "Africa" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", currency: "USD", zone: "africa", region: "Africa" },
  { code: "GQ", name: "Equatorial Guinea", flag: "🇬🇶", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ER", name: "Eritrea", flag: "🇪🇷", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SZ", name: "Eswatini", flag: "🇸🇿", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", currency: "USD", zone: "africa", region: "Africa" },
  { code: "GA", name: "Gabon", flag: "🇬🇦", currency: "USD", zone: "africa", region: "Africa" },
  { code: "GM", name: "Gambia", flag: "🇬🇲", currency: "USD", zone: "africa", region: "Africa" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", currency: "GHS", zone: "africa", region: "Africa" },
  { code: "GN", name: "Guinea", flag: "🇬🇳", currency: "USD", zone: "africa", region: "Africa" },
  { code: "GW", name: "Guinea-Bissau", flag: "🇬🇼", currency: "USD", zone: "africa", region: "Africa" },
  { code: "CI", name: "Ivory Coast", flag: "🇨🇮", currency: "USD", zone: "africa", region: "Africa" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", currency: "KES", zone: "africa", region: "Africa" },
  { code: "LS", name: "Lesotho", flag: "🇱🇸", currency: "USD", zone: "africa", region: "Africa" },
  { code: "LR", name: "Liberia", flag: "🇱🇷", currency: "USD", zone: "africa", region: "Africa" },
  { code: "LY", name: "Libya", flag: "🇱🇾", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MG", name: "Madagascar", flag: "🇲🇬", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MW", name: "Malawi", flag: "🇲🇼", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ML", name: "Mali", flag: "🇲🇱", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MR", name: "Mauritania", flag: "🇲🇷", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MU", name: "Mauritius", flag: "🇲🇺", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", currency: "USD", zone: "africa", region: "Africa" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", currency: "USD", zone: "africa", region: "Africa" },
  { code: "NA", name: "Namibia", flag: "🇳🇦", currency: "USD", zone: "africa", region: "Africa" },
  { code: "NE", name: "Niger", flag: "🇳🇪", currency: "USD", zone: "africa", region: "Africa" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN", zone: "africa", region: "Africa" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ST", name: "Sao Tome and Principe", flag: "🇸🇹", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SC", name: "Seychelles", flag: "🇸🇨", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SL", name: "Sierra Leone", flag: "🇸🇱", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SO", name: "Somalia", flag: "🇸🇴", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR", zone: "africa", region: "Africa" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸", currency: "USD", zone: "africa", region: "Africa" },
  { code: "SD", name: "Sudan", flag: "🇸🇩", currency: "USD", zone: "africa", region: "Africa" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", currency: "USD", zone: "africa", region: "Africa" },
  { code: "TG", name: "Togo", flag: "🇹🇬", currency: "USD", zone: "africa", region: "Africa" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳", currency: "USD", zone: "africa", region: "Africa" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲", currency: "USD", zone: "africa", region: "Africa" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼", currency: "USD", zone: "africa", region: "Africa" },
];

export const INTERNATIONAL_COUNTRIES: Country[] = [
  // Americas
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD", zone: "international", region: "Americas" },
  { code: "CA", name: "Canada", flag: "🇨🇦", currency: "USD", zone: "international", region: "Americas" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", currency: "USD", zone: "international", region: "Americas" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", currency: "USD", zone: "international", region: "Americas" },
  // Europe
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP", zone: "international", region: "Europe" },
  { code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR", zone: "international", region: "Europe" },
  { code: "FR", name: "France", flag: "🇫🇷", currency: "EUR", zone: "international", region: "Europe" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", currency: "EUR", zone: "international", region: "Europe" },
  { code: "IT", name: "Italy", flag: "🇮🇹", currency: "EUR", zone: "international", region: "Europe" },
  { code: "ES", name: "Spain", flag: "🇪🇸", currency: "EUR", zone: "international", region: "Europe" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", currency: "EUR", zone: "international", region: "Europe" },
  { code: "IE", name: "Ireland", flag: "🇮🇪", currency: "EUR", zone: "international", region: "Europe" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", currency: "EUR", zone: "international", region: "Europe" },
  { code: "AT", name: "Austria", flag: "🇦🇹", currency: "EUR", zone: "international", region: "Europe" },
  { code: "GR", name: "Greece", flag: "🇬🇷", currency: "EUR", zone: "international", region: "Europe" },
  { code: "FI", name: "Finland", flag: "🇫🇮", currency: "EUR", zone: "international", region: "Europe" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", currency: "USD", zone: "international", region: "Europe" },
  { code: "NO", name: "Norway", flag: "🇳🇴", currency: "USD", zone: "international", region: "Europe" },
  { code: "PL", name: "Poland", flag: "🇵🇱", currency: "USD", zone: "international", region: "Europe" },
  { code: "TR", name: "Turkey", flag: "🇹🇷", currency: "USD", zone: "international", region: "Europe" },
  // Middle East
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "USD", zone: "international", region: "Middle East" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", currency: "USD", zone: "international", region: "Middle East" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", currency: "USD", zone: "international", region: "Middle East" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", currency: "USD", zone: "international", region: "Middle East" },
  { code: "IL", name: "Israel", flag: "🇮🇱", currency: "USD", zone: "international", region: "Middle East" },
  // Asia
  { code: "IN", name: "India", flag: "🇮🇳", currency: "USD", zone: "international", region: "Asia" },
  { code: "CN", name: "China", flag: "🇨🇳", currency: "USD", zone: "international", region: "Asia" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", currency: "USD", zone: "international", region: "Asia" },
  { code: "PH", name: "Philippines", flag: "🇵🇭", currency: "USD", zone: "international", region: "Asia" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", currency: "USD", zone: "international", region: "Asia" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", currency: "USD", zone: "international", region: "Asia" },
  { code: "JP", name: "Japan", flag: "🇯🇵", currency: "USD", zone: "international", region: "Asia" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", currency: "USD", zone: "international", region: "Asia" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", currency: "USD", zone: "international", region: "Asia" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", currency: "USD", zone: "international", region: "Asia" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", currency: "USD", zone: "international", region: "Asia" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩", currency: "USD", zone: "international", region: "Asia" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰", currency: "USD", zone: "international", region: "Asia" },
  // Oceania
  { code: "AU", name: "Australia", flag: "🇦🇺", currency: "USD", zone: "international", region: "Oceania" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", currency: "USD", zone: "international", region: "Oceania" },
];

export const COUNTRIES: Country[] = [...AFRICA_COUNTRIES, ...INTERNATIONAL_COUNTRIES];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

// Grouped by `region` for section headers in the International picker.
export function groupByRegion(countries: Country[]): { region: string; countries: Country[] }[] {
  const order: string[] = [];
  const groups: Record<string, Country[]> = {};
  for (const c of countries) {
    if (!groups[c.region]) { groups[c.region] = []; order.push(c.region); }
    groups[c.region].push(c);
  }
  return order.map((region) => ({ region, countries: groups[region] }));
}
