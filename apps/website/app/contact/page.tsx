import type { Metadata } from "next"
import { EnquiryForm } from "@/components/EnquiryForm"
import { PageHero, Section } from "@/components/site"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with BukkaPay.",
  alternates: { canonical: "/contact" },
}

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to us"
                intro="Customers with a question about a payment should use in-app support — we can see your transaction there. For everything else, send us a message." />
      <Section>
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="space-y-4 text-sm text-ink-soft">
            <p><span className="font-semibold text-ink">Support:</span> in the BukkaPay app → Profile → Support</p>
            <p><span className="font-semibold text-ink">Security:</span> security@bukkapay.com</p>
            <p><span className="font-semibold text-ink">Privacy:</span> privacy@bukkapay.com</p>
            <p><span className="font-semibold text-ink">Compliance:</span> compliance@bukkapay.com</p>
          </div>
          <div className="lg:col-span-2"><EnquiryForm /></div>
        </div>
      </Section>
    </>
  )
}
