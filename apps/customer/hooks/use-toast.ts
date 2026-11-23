import { Alert, Platform } from "react-native";

type Toast = { title?: string; description?: string; variant?: string };

/** react-native-web's Alert.alert is a no-op, so on the web every toast was
 *  silently dropped. Web gets a small self-dismissing banner; native keeps Alert. */
function webToast({ title, description, variant }: Toast) {
  if (typeof document === "undefined") return;
  let host = document.getElementById("bkp-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "bkp-toasts";
    host.setAttribute("aria-live", "polite");
    Object.assign(host.style, {
      position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: "99999",
      display: "flex", flexDirection: "column", gap: "8px", width: "min(92vw, 420px)", pointerEvents: "none",
    });
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.setAttribute("role", variant === "destructive" ? "alert" : "status");
  Object.assign(el.style, {
    background: variant === "destructive" ? "#B91C1C" : "#111827", color: "#fff", borderRadius: "14px",
    padding: "12px 16px", font: "14px/1.4 system-ui, -apple-system, Segoe UI, sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,.25)", opacity: "0", transition: "opacity .2s, transform .2s", transform: "translateY(8px)",
  });
  const t = document.createElement("div"); t.style.fontWeight = "700"; t.textContent = title || "";
  el.appendChild(t);
  if (description) { const d = document.createElement("div"); d.style.opacity = ".85"; d.textContent = description; el.appendChild(d); }
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "none"; });
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, variant === "destructive" ? 5000 : 3000);
}

export function useToast() {
  return {
    toast: (t: Toast) => {
      if (Platform.OS === "web") webToast(t);
      else Alert.alert(t.title || "", t.description || "");
    },
  };
}
