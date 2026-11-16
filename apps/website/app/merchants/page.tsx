import type { Metadata } from "next"
import { ContentPage } from "@/components/content"
import { ButtonLink } from "@/components/site"
import { MERCHANT_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: "Merchant solutions",
  description: "Accept payments with QR codes, checkout links and APIs.",
  alternates: { canonical: "/merchants" },
}

const blocks = [
  {
    "kind": "features",
    "title": "Ways to get paid",
    "items": [
      [
        "Signed QR codes",
        "Print a static code for the counter, or create a one-time code with the amount fixed. Every code is signed so it can't be altered."
      ],
      [
        "Checkout links",
        "A hosted, secure checkout you can share on WhatsApp, SMS, email or social media."
      ],
      [
        "API & webhooks",
        "Create checkout links from your website and receive signed webhooks when payments succeed."
      ]
    ]
  },
  {
    "kind": "features",
    "title": "Run the business",
    "items": [
      [
        "Live dashboard",
        "Today's and this month's sales, refunds and fees — per currency."
      ],
      [
        "Refunds",
        "Full or partial refunds straight back to the customer's wallet."
      ],
      [
        "Settlements",
        "Pay out to your bank account; payouts show as settled only when the bank confirms."
      ],
      [
        "Staff roles",
        "Owner, administrator, finance, cashier and viewer — everyone uses their own login."
      ],
      [
        "Exports",
        "Download transactions as CSV for your accountant."
      ],
      [
        "Verification",
        "A quick business verification (KYB) keeps the network safe for everyone."
      ]
    ]
  },
  {
    "kind": "steps",
    "title": "Get set up",
    "items": [
      [
        "Register your business",
        "Sign in with your BukkaPay account and add your business."
      ],
      [
        "Verify it",
        "Registration details, address, owners/directors and documents."
      ],
      [
        "Start accepting payments",
        "Create QR codes and links as soon as you're approved."
      ],
      [
        "Get paid out",
        "Add your bank account and request payouts."
      ]
    ]
  }
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"For business"} title={"Accept payments from customers across the network."}
                 intro={"From a spaza shop counter to an online store: QR codes, checkout links, an API, and settlements to your bank account."} actions={<><ButtonLink href={MERCHANT_URL}>Register a business</ButtonLink><ButtonLink href="/contact" variant="secondary">Talk to sales</ButtonLink></>} blocks={blocks as any} />
  )
}
