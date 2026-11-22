import type { Config } from "tailwindcss"

// BukkaPay design tokens — shared with the customer app and admin console
// (violet brand, deep "night" ink, emerald for money-received moments,
// Outfit for display, DM Sans for body).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: { 50: "#F5F3FF", 100: "#EDE9FE", 200: "#DDD6FE", 300: "#C4B5FD", 400: "#A78BFA", 500: "#8B5CF6", 600: "#7C3AED", 700: "#6D28D9", 800: "#5B21B6", 900: "#3B0764" },
        night: { DEFAULT: "#0B0A1A", 800: "#12112A", 700: "#1A1838", 600: "#262347" },
        ink: { DEFAULT: "#1A1A2E", soft: "#4B5563", muted: "#6B7280" },
        money: { DEFAULT: "#10B981", soft: "#D1FAE5" },
        line: "#E7E5F0",
        surface: "#FAF9FD",
      },
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem", "4xl": "2rem" },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,58,237,0.08), 0 20px 60px -20px rgba(124,58,237,0.45)",
        card: "0 1px 2px rgba(16,12,40,0.04), 0 12px 32px -16px rgba(16,12,40,0.18)",
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        "fade-up": "fade-up 0.8s ease-out both",
      },
    },
  },
  plugins: [],
}
export default config
