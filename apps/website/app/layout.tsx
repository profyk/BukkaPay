import type { Metadata, Viewport } from "next"
import "./globals.css"
import { AnnouncementBar, Footer, Header } from "@/components/site"
import { getSite } from "@/lib/content"
import { SITE_URL } from "@/lib/site"

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSite()
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: settings.seoTitle, template: "%s · BukkaPay" },
    description: settings.seoDescription,
    icons: { icon: "/logo.png", apple: "/logo.png" },
    openGraph: {
      type: "website", siteName: "BukkaPay", url: SITE_URL, title: settings.seoTitle, description: settings.seoDescription,
    },
    twitter: { card: "summary_large_image", title: settings.seoTitle, description: settings.seoDescription },
    alternates: { canonical: "/" },
  }
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7C3AED" }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { settings } = await getSite()
  const org = {
    "@context": "https://schema.org", "@type": "Organization", name: "BukkaPay", url: SITE_URL,
    logo: `${SITE_URL}/logo.png`, email: settings.supportEmail, sameAs: settings.socials.map((s) => s.href),
  }
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <AnnouncementBar settings={settings} />
        <Header settings={settings} />
        <main id="main">{children}</main>
        <Footer settings={settings} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      </body>
    </html>
  )
}
