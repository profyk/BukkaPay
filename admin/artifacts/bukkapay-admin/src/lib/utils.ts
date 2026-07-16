import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD", "R": "ZAR", "€": "EUR", "£": "GBP", "¥": "JPY",
}

export function formatCurrency(amount: number, currency = "ZAR") {
  const code = SYMBOL_TO_CODE[currency] ?? (currency?.length === 3 ? currency : "ZAR")
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(Number(amount) || 0)
  } catch {
    return `R ${(Number(amount) || 0).toFixed(2)}`
  }
}

export function formatDate(iso?: string | null, withTime = false) {
  if (!iso) return "—"
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
  if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit" }
  return d.toLocaleString("en-GB", opts)
}
