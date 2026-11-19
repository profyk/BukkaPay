import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  // When a new deploy's service worker takes over an open tab, reload once so
  // the admin sees the new version instead of the cached old one.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  // Older builds cached admin API responses in the browser; remove them.
  if ("caches" in window) void caches.delete("bukkapay-api").catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
