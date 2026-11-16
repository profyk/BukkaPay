"use client"

/** Thin client for the BukkaPay API (api.bukkapay.com). Merchant owners and
 *  staff sign in with their own BukkaPay account; the session token lives in
 *  localStorage and is sent as a Bearer token. Every rule (roles, KYB gate,
 *  limits, PIN) is enforced by the API — this app only presents it. */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, "")
const TOKEN_KEY = "bukkapay_merchant_token"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return window.localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body = init.body
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.json)
  }
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers, body })
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    setToken(null)
    window.location.href = "/login"
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const message = (data && (data.error || data.message || data.detail?.[0]?.msg)) || `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

function safeJson(text: string) {
  try { return JSON.parse(text) } catch { return text }
}

export function idempotencyKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
