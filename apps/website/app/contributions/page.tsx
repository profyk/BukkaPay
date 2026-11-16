import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Community contributions",
  description: "Pool money for community projects, events and shared goals.",
  alternates: { canonical: "/contributions" },
}

const blocks = [
  {
    "kind": "features",
    "title": "Clear and accountable",
    "items": [
      [
        "Target & progress",
        "Set a target and closing date; everyone sees progress."
      ],
      [
        "Every contribution recorded",
        "Contributions move real money into a dedicated campaign balance with a full history."
      ],
      [
        "Controlled payouts",
        "Only the campaign creator can move collected funds to their wallet."
      ],
      [
        "Share anywhere",
        "A link and QR code for each campaign."
      ]
    ]
  },
  {
    "kind": "note",
    "title": "Please note",
    "body": "Community contributions are a way to collect money for a shared purpose. They are not a savings, deposit or investment product and earn no interest. Medical and charitable fundraising may be subject to local rules."
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Community contributions"} title={"Raise money together, transparently."}
                 intro={"Create a campaign for a community project, a family event or a school trip and share it with a link or QR code."} blocks={blocks as any} />
  )
}
