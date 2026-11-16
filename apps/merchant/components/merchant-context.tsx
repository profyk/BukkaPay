"use client"

import { createContext, useContext } from "react"
import type { Membership } from "@/lib/hooks"

export const MerchantContext = createContext<Membership | null>(null)
export const useMerchant = () => useContext(MerchantContext)
