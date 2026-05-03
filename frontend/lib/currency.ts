import AsyncStorage from "@react-native-async-storage/async-storage";

export type CurrencyCode = "USD" | "ZAR" | "BWP";

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rate: number;
}

export const CURRENCIES: Currency[] = [
  { code: "ZAR", symbol: "R", name: "South African Rand", rate: 18.2 },
  { code: "USD", symbol: "$", name: "US Dollar", rate: 1 },
  { code: "BWP", symbol: "P", name: "Botswana Pula", rate: 13.5 },
];

export function getCurrency(code: CurrencyCode): Currency {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

export function convertAmount(amountUSD: number, toCurrency: CurrencyCode): number {
  const currency = getCurrency(toCurrency);
  return amountUSD * currency.rate;
}

export function formatCurrency(amount: number, currencyCode: CurrencyCode): string {
  const currency = getCurrency(currencyCode);
  const convertedAmount = convertAmount(amount, currencyCode);
  return `${currency.symbol}${convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
