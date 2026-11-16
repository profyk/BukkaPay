/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Paths used by the previous site, kept working after the switch.
  async redirects() {
    return [
      ["/privacy", "/legal/privacy-policy"], ["/privacy-policy", "/legal/privacy-policy"],
      ["/terms", "/legal/terms"], ["/terms-and-conditions", "/legal/terms"],
      ["/cookies", "/legal/cookies"], ["/cookie-policy", "/legal/cookies"],
      ["/business", "/merchants"], ["/features", "/how-it-works"], ["/waitlist", "/#waitlist"],
      ["/login", "https://app.bukkapay.com"], ["/signup", "/#waitlist"],
    ].map(([source, destination]) => ({ source, destination, permanent: false }))
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }]
  },
}
export default nextConfig
