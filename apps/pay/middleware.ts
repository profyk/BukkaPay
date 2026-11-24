import { NextResponse, type NextRequest } from "next/server";

/**
 * A fresh nonce per request: only our own scripts can run on a payment page,
 * so an injected script can't read what a payer types or redirect them.
 * Network access is limited to the BukkaPay API; navigation to the bank
 * (Stitch) happens by full-page redirect, which CSP doesn't need to allow.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "https://api.bukkapay.com";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${API}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|icon.png|apple-icon.png).*)" }],
};
