"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"

export function QrImage({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1A1A2E", light: "#FFFFFF" } })
      .then(setSrc)
      .catch(() => setSrc(null))
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-surface" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={label ?? "Payment QR code"} className="rounded-xl bg-white" />
}

export async function downloadQr(value: string, filename: string) {
  const url = await QRCode.toDataURL(value, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
}
