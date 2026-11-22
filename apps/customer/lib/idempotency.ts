/**
 * Adds an `Idempotency-Key` to every mutating request the app sends to the
 * BukkaPay API (unless the screen already set one for that action).
 *
 * The key is derived from the method, URL and body within a 2-minute window,
 * so a double tap or an automatic retry of the *same* request carries the
 * same key — the API then runs it once and replays the first result. Screens
 * that want an explicit per-action key (Pay Supplier, Swap) set their own.
 */
import { API_BASE } from "./config";

const WINDOW_MS = 2 * 60 * 1000;

function hash(s: string): string {
  // FNV-1a 64-bit as two 32-bit halves — fast, stable, plenty for a dedupe key.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function hasHeader(h: HeadersInit | undefined, name: string): boolean {
  if (!h) return false;
  const n = name.toLowerCase();
  if (typeof (h as any).has === "function") return (h as Headers).has(name);
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === n);
  return Object.keys(h).some((k) => k.toLowerCase() === n);
}

let installed = false;

export function installIdempotency(): void {
  if (installed || typeof globalThis.fetch !== "function") return;
  installed = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && url.startsWith(API_BASE) && !hasHeader(init?.headers, "Idempotency-Key")) {
      const body = typeof init?.body === "string" ? init.body : "";
      const key = "app-" + hash(`${method} ${url} ${body} ${Math.floor(Date.now() / WINDOW_MS)}`);
      const headers = init?.headers instanceof Headers
        ? Object.fromEntries((init.headers as Headers).entries())
        : Array.isArray(init?.headers) ? Object.fromEntries(init!.headers as [string, string][]) : { ...(init?.headers as Record<string, string> | undefined) };
      init = { ...init, headers: { ...headers, "Idempotency-Key": key } };
    }
    return original(input, init);
  };
}
