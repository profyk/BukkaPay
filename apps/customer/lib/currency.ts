import AsyncStorage from "@react-native-async-storage/async-storage";

// The currencies BukkaPay wallets can actually hold. Each wallet card is
// denominated in exactly one of these (real balance, not a display
// conversion) — converting between them only happens through Send Money's
// Africa/International tiers, priced by the admin-configured corridor rate
// (see /api/transfer/quote), never client-side.
export type CurrencyCode = "USD" | "ZAR" | "BWP";

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "BWP", symbol: "P", name: "Botswana Pula" },
];

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

export function formatCurrency(amount: number, currencyCode: CurrencyCode): string {
  const currency = getCurrency(currencyCode);
  return `${currency.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// No-op kept for the many display-only call sites across the app
// (analytics, purchases, payment links, etc.) that pre-date real
// per-currency wallets — they used to multiply by a fake static rate to
// simulate a "display currency" toggle. Now that an amount's currency is
// a real, specific fact (which wallet card it's on) rather than a single
// blended figure, there's nothing left to convert: the number shown is
// already in its own currency, so this just passes it through unchanged.
export function convertAmount(amount: number, _toCurrency: CurrencyCode): number {
  return amount;
}

const VALID_CODES: CurrencyCode[] = ["USD", "ZAR", "BWP"];
const DEFAULT_CURRENCY: CurrencyCode = "ZAR";

export function getInitialCurrency(): CurrencyCode {
  if (typeof window !== "undefined" && window.localStorage) {
    const stored = localStorage.getItem("displayCurrency");
    if (stored && VALID_CODES.includes(stored as CurrencyCode)) {
      return stored as CurrencyCode;
    }
  }
  return DEFAULT_CURRENCY;
}

export async function getStoredCurrency(): Promise<CurrencyCode> {
  const stored = await AsyncStorage.getItem("displayCurrency");
  if (stored && VALID_CODES.includes(stored as CurrencyCode)) {
    return stored as CurrencyCode;
  }
  return DEFAULT_CURRENCY;
}

export async function setStoredCurrency(code: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem("displayCurrency", code);
}
