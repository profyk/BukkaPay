import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Lock } from "@/lib/icons";
import "./globals.css";

export const metadata: Metadata = {
  title: "BukkaPay · Secure payment",
  description: "Pay securely with BukkaPay.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { themeColor: "#010C38", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page render per request, so Next adds
  // this request's CSP nonce to its scripts (see middleware.ts).
  await headers();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <a href="https://bukkapay.com" className="brand" rel="noopener">
            <img src="/icon.png" alt="" width={28} height={28} />
            <span>BukkaPay</span>
          </a>
          {/* Shown on every page so payers can check they're on the real site. */}
          <span className="secure" title="Check the address bar shows pay.bukkapay.com">
            <Lock size={12} /> <span className="domain">pay.bukkapay.com</span>
          </span>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <p>BukkaPay never asks for your banking password, card details or BukkaPay sign-in on this site.</p>
          <p>
            <a href="https://bukkapay.com/legal" rel="noopener">Terms &amp; privacy</a> ·{" "}
            <a href="https://bukkapay.com/security" rel="noopener">Security</a> ·{" "}
            <a href="https://bukkapay.com/contact" rel="noopener">Help</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
