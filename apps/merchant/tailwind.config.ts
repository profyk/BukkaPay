import type { Config } from "tailwindcss"

// BukkaPay design tokens — shared with the website and the customer app
// (violet brand, ink text, Outfit for display, DM Sans for body).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: { 50: "#F5F3FF", 100: "#EDE9FE", 200: "#DDD6FE", 500: "#8B5CF6", 600: "#7C3AED", 700: "#6D28D9", 900: "#3B0764" },
        ink: { DEFAULT: "#1A1A2E", soft: "#4B5563", muted: "#6B7280" },
        line: "#E5E7EB",
        surface: "#F9FAFB",
      },
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
}
export default config
