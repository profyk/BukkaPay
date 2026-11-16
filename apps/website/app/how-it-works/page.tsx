import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "How it works",
  description: "How BukkaPay wallets, payments and cross-border transfers work.",
  alternates: { canonical: "/how-it-works" },
}

const blocks = [
  {
    "kind": "steps",
    "title": "Getting started",
    "items": [
      [
        "Register",
        "Sign up with your phone or email, choose your country and accept the terms."
      ],
      [
        "Verify",
        "Confirm your contact details, then your identity. Limits grow with your verification level."
      ],
      [
        "Set your PIN",
        "Every payment is confirmed with your transaction PIN (and biometrics where your phone supports it)."
      ],
      [
        "Add money",
        "Top up through the methods approved in your country — like instant EFT in South Africa."
      ]
    ]
  },
  {
    "kind": "steps",
    "title": "Sending money across a border",
    "items": [
      [
        "Get a quote",
        "You see the exchange rate, the fee, the exact amount that leaves your wallet and the exact amount that arrives — and how long the quote is valid."
      ],
      [
        "Confirm",
        "You confirm the quote with your PIN. Your wallet is debited."
      ],
      [
        "Settlement",
        "The payment travels over an approved settlement rail between licensed institutions."
      ],
      [
        "Delivery",
        "The recipient is credited only once settlement is confirmed. If it can't be delivered, you're refunded in full."
      ]
    ]
  },
  {
    "kind": "note",
    "title": "Your balance is never one big pot",
    "body": "Each currency wallet is accounted for separately and backed by the arrangement in that country. We never add different currencies together into a single \"total\" without telling you it's an estimate."
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"How it works"} title={"Simple on the surface. Rigorous underneath."}
                 intro={"Here's what happens when you open a wallet, pay someone, or send money across a border."} blocks={blocks as any} />
  )
}
