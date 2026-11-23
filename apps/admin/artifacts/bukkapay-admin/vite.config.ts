import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const isVercel = process.env.VERCEL === "1";
const isDev = process.env.NODE_ENV !== "production";

const rawPort = process.env.PORT;
const basePath = process.env.BASE_PATH ?? "/";

if (!isVercel && isDev && !rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort ?? "3000");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icons/apple-touch-icon.png"],
      // Installable from the browser ("Install app"), never listed in an app
      // store: updates reach every admin instantly and nothing is public.
      manifest: {
        id: basePath,
        name: "BukkaPay Console",
        short_name: "BukkaPay Admin",
        description: "BukkaPay operations console for authorised administrators.",
        theme_color: "#010C38",
        background_color: "#010C38",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        start_url: basePath,
        scope: basePath,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      // Always serve the newest deploy: the page itself comes from the network
      // (cache only as an offline fallback), a new worker takes over at once,
      // and old precaches are removed. Admin API responses are never cached —
      // they contain personal and financial data.
      workbox: {
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "bukkapay-admin-pages", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, isVercel ? "dist" : "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
