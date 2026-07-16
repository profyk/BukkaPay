import { CurrencyCode } from "./currency";

// Which of BukkaPay's 3 supported wallet currencies a recipient in a given
// country ends up holding. South Africa, Zimbabwe, and Botswana are named
// explicitly per BukkaPay's initial corridors; every other African country
// defaults to USD, the common cross-border settlement currency, until it
// gets its own named entry here.
export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  currency: CurrencyCode;
}

export const COUNTRIES: Country[] = [
  { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼", currency: "USD" },
  { code: "BW", name: "Botswana", flag: "🇧🇼", currency: "BWP" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "USD" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", currency: "USD" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", currency: "USD" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲", currency: "USD" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", currency: "USD" },
  { code: "NA", name: "Namibia", flag: "🇳🇦", currency: "USD" },
  { code: "MW", name: "Malawi", flag: "🇲🇼", currency: "USD" },
  { code: "LS", name: "Lesotho", flag: "🇱🇸", currency: "USD" },
  { code: "SZ", name: "Eswatini", flag: "🇸🇿", currency: "USD" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", currency: "USD" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", currency: "USD" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", currency: "USD" },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
