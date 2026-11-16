import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "BukkaPay for Business",
  description: "Accept payments, manage settlements and run your business on the BukkaPay network.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7C3AED" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
