import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Cross-border payments",
  description: "Send money between African countries on approved corridors.",
  alternates: { canonical: "/cross-border" },
}

const blocks = [
  {
    "kind": "features",
    "title": "How we keep it honest",
    "items": [
      [
        "Executable quotes",
        "Rate, fee, amount debited and amount received — locked for a short window before you confirm."
      ],
      [
        "No stale rates",
        "If our partner's rate is out of date, we won't quote. You never pay on an old rate."
      ],
      [
        "Approved corridors only",
        "Each route is switched on only when both countries, the settlement rail and liquidity are ready."
      ],
      [
        "Credited on settlement",
        "Recipients are credited when settlement is confirmed — not merely because you were debited."
      ],
      [
        "Full refund if it fails",
        "If delivery fails, the whole amount (fee included) comes back to your wallet."
      ],
      [
        "Ready for PAPSS",
        "Our routing supports the Pan-African Payment and Settlement System where eligible participants connect — and other approved bank and PSP rails."
      ]
    ]
  },
  {
    "kind": "note",
    "title": "Availability",
    "body": "Corridors open one by one as regulatory approvals and partner agreements are completed. Check the Countries page for what's available today."
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Cross-border"} title={"Send across borders without surprises."}
                 intro={"Exact quotes, approved routes and confirmed settlement — so what you see is what arrives."} blocks={blocks as any} />
  )
}
