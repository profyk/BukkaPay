"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "./api"

/** Minimal data hook: loads `path`, exposes reload, never caches across pages. */
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      setData(await api<T>(path))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload }
}

export type Membership = {
  id: string; businessName: string; role: string; kybStatus: string; country: string; currency: string
  verificationTier?: "business" | "individual"
  isActive: boolean; logo?: string | null
}

export const CAN: Record<string, string[]> = {
  collect: ["owner", "admin", "manager", "cashier", "finance"],
  refund: ["owner", "admin", "manager", "finance"],
  finance: ["owner", "admin", "manager", "finance"],
  settings: ["owner", "admin", "manager"],
  developer: ["owner", "admin", "manager"],
  owner: ["owner"],
}

export function can(role: string | undefined, capability: keyof typeof CAN) {
  return !!role && CAN[capability].includes(role)
}
