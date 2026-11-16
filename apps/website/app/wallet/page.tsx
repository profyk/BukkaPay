import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Customer wallet",
  description: "A multi-currency digital wallet for everyday payments.",
  alternates: { canonical: "/wallet" },
}

const blocks = [
  {
    "kind": "features",
    "title": "Built for everyday life",
    "items": [
      [
        "Multiple currency wallets",
        "Separate wallets per currency, each with its own balance and history."
      ],
      [
        "Pay by username, phone or QR",
        "Find people by BukkaPay ID, username, phone number or by scanning their code."
      ],
      [
        "Request money",
        "Send a request with an amount and note. Track it, cancel it, get notified when it's paid."
      ],
      [
        "Add & withdraw",
        "Top up and withdraw through approved local methods, with fees shown up front."
      ],
      [
        "Clear history",
        "Search and filter every transaction, download receipts, and report a problem."
      ],
      [
        "Real notifications",
        "Know the moment money arrives, leaves, or needs your attention."
      ]
    ]
  },
  {
    "kind": "features",
    "title": "Safety by default",
    "cols": 2,
    "items": [
      [
        "Transaction PIN on every payment",
        "Plus biometric unlock on supported devices and alerts on new logins."
      ],
      [
        "Limits that fit your verification",
        "Higher limits as you verify your identity — set per country by our compliance team."
      ]
    ]
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Customer wallet"} title={"Your money, in every currency you use."}
                 intro={"Hold, send, receive and spend in the currencies available in your country — from one app."} blocks={blocks as any} />
  )
}
