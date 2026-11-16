export function money(amount: string | number | null | undefined, currency?: string) {
  if (amount === null || amount === undefined || amount === "") return "—"
  const n = Number(amount)
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "ZAR", minimumFractionDigits: 2 }).format(n)
  } catch {
    return `${currency ?? ""} ${n.toFixed(2)}`.trim()
  }
}

export function when(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
