import type { Metadata } from "next"
import { ContentPage } from "@/components/content"

export const metadata: Metadata = {
  title: "Delete your BukkaPay account",
  description: "How to delete your BukkaPay account and what happens to your data.",
  alternates: { canonical: "/delete-account" },
}

const blocks = [
  {
    kind: "steps",
    title: "Delete your account in the app",
    items: [
      ["Withdraw your money", "Move any remaining balance out first: a closed account can't hold money. Cancel any unused cash withdrawal code."],
      ["Open Profile → Delete account", "In the BukkaPay app or at app.bukkapay.com (business accounts: merchant.bukkapay.com → Delete account). You'll see what will be deleted and anything that still needs doing."],
      ["Type DELETE and enter your PIN (or password)", "Your account closes straight away and you're signed out on every device. We email you a confirmation."],
    ],
  },
  {
    kind: "steps",
    title: "Can't use the app?",
    items: [
      ["Email us", "Send \"Delete my account\" to privacy@bukkapay.com from the email address on your BukkaPay account."],
      ["We verify it's you", "We reply within 2 business days to confirm your identity and check for any remaining balance."],
      ["We close the account", "Within 30 days of verification, and confirm by email."],
    ],
  },
  {
    kind: "features",
    title: "What happens to your data",
    cols: 2,
    items: [
      ["Deleted straight away", "Your profile, photo, username, phone number, password, PIN, biometrics, Apple and Google sign-in links, saved contacts, beneficiaries, devices and notification settings."],
      ["Kept for 5 years, then deleted", "Identity verification and transaction records, because anti-money-laundering and financial record-keeping laws require it. They're sealed, only our compliance team can access them, and they're deleted automatically when the period ends."],
      ["Not deleted: money", "Money is never deleted with an account. That's why you withdraw any balance first."],
      ["Google sign-in", "You can also remove BukkaPay's access at myaccount.google.com/permissions at any time."],
    ],
  },
  {
    kind: "note",
    title: "More detail",
    body: "See section 10 of our Privacy Policy (bukkapay.com/legal/privacy-policy) for your data rights, retention periods and how to complain to a data protection regulator.",
  },
] as const

export default function Page() {
  return (
    <ContentPage eyebrow={"Your account"} title={"Delete your BukkaPay account"}
                 intro={"You can delete your account at any time, in the app or by email. Here's exactly what happens."} blocks={blocks as any} />
  )
}
