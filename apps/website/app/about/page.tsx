import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "About BukkaPay",
  description: "BukkaPay is building a connected payment network for Africa.",
  alternates: { canonical: "/about" },
}

const blocks = [
  {
    "kind": "features",
    "title": "What we believe",
    "items": [
      [
        "Payments should cross borders as easily as messages",
        "Africans trade, study, work and support family across borders every day. Moving money between neighbours shouldn't be slow or expensive."
      ],
      [
        "Trust is built in the open",
        "We show every fee and exchange rate before you confirm, and we only describe a country as live when it actually is."
      ],
      [
        "Local partners, one network",
        "Licensed institutions in each country hold and settle funds. BukkaPay connects them into a single experience."
      ]
    ]
  },
  {
    "kind": "features",
    "title": "What BukkaPay does — and doesn't do",
    "cols": 2,
    "items": [
      [
        "BukkaPay runs",
        "The wallet app, payment routing and orchestration, the merchant network, APIs, reporting and platform operations."
      ],
      [
        "Licensed partners hold the money",
        "In each country, an approved local financial institution performs the regulated activities — safeguarding funds, collections and settlement — under local law and contract."
      ]
    ]
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"About"} title={"We're connecting Africa's money, one country at a time."}
                 intro={"BukkaPay is a payment technology company building one connected wallet and payment network for people, merchants and businesses across Africa."} blocks={blocks as any} />
  )
}
