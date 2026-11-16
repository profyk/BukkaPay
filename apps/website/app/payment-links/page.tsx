import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Payment links",
  description: "Request money with a secure, shareable link.",
  alternates: { canonical: "/payment-links" },
}

const blocks = [
  {
    "kind": "features",
    "title": "Flexible by design",
    "items": [
      [
        "Fixed or flexible amounts",
        "Ask for an exact amount, or allow part payments up to the total."
      ],
      [
        "Share anywhere",
        "WhatsApp, SMS, email, social media — it's just a link."
      ],
      [
        "Expiry & cancellation",
        "Set an expiry and cancel unpaid links at any time."
      ],
      [
        "Verified requester",
        "Payers see who they're paying before they confirm."
      ],
      [
        "Confirmed, not assumed",
        "A link is marked paid only when the payment is verified with our provider — never because a browser was redirected."
      ],
      [
        "Guest checkout",
        "Where permitted, people without BukkaPay can pay by instant EFT."
      ]
    ]
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Payment links"} title={"Get paid with a link."}
                 intro={"Create a link, share it anywhere, and get paid by wallet or approved local payment methods."} blocks={blocks as any} />
  )
}
