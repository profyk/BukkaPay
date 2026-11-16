import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Security",
  description: "How BukkaPay protects your money and data.",
  alternates: { canonical: "/security" },
}

const blocks = [
  {
    "kind": "features",
    "title": "Financial integrity",
    "items": [
      [
        "Double-entry ledger",
        "Every movement is recorded as balanced entries that can't be edited — corrections are separate reversals."
      ],
      [
        "No balance editing",
        "Balances can only change through approved financial workflows. Not even administrators can type in a balance."
      ],
      [
        "Idempotent payments",
        "Retrying a payment can never charge you twice."
      ],
      [
        "Daily reconciliation",
        "Our ledger is reconciled against partner and bank records, and exceptions are investigated."
      ],
      [
        "Maker-checker controls",
        "High-risk operations need two people: one to request, another to approve."
      ],
      [
        "Full audit trail",
        "Every privileged action is recorded."
      ]
    ]
  },
  {
    "kind": "features",
    "title": "Protecting your account and data",
    "items": [
      [
        "PIN, biometrics & sessions",
        "Transaction PIN on every payment, biometric unlock, and device/session controls."
      ],
      [
        "Encryption",
        "Encrypted in transit; sensitive card data is encrypted at rest. Card payments use hosted, tokenised checkout from our partners."
      ],
      [
        "Privacy by design",
        "We collect what's needed to serve you and meet legal obligations, aligned with POPIA and local data-protection laws."
      ]
    ]
  },
  {
    "kind": "note",
    "title": "Report a vulnerability",
    "body": "If you believe you've found a security issue, please contact security@bukkapay.com. Please don't access other people's data or disrupt the service while testing."
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Security"} title={"Built so money can't appear or disappear."}
                 intro={"Security and financial integrity are designed into BukkaPay from the database up."} blocks={blocks as any} />
  )
}
