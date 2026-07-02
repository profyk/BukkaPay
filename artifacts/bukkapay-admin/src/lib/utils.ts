import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso?: string | null, withTime = false) {
  if (!iso) return "—"
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
  if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit" }
  return d.toLocaleString("en-GB", opts)
}
