import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
          <span className="secure"><LockIcon /> Secure payment</span>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <p>BukkaPay never asks for your PIN or password on this page.</p>
          <p><a href="https://bukkapay.com/legal" rel="noopener">Terms &amp; privacy</a> · <a href="https://bukkapay.com/contact" rel="noopener">Help</a></p>
        </footer>
      </body>
    </html>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
