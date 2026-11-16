import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "BukkaPay — One Africa. One Payment Network."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    padding: 72, background: "linear-gradient(135deg, #1A1A2E 0%, #3B0764 100%)", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center" }}>B</div>
          BukkaPay
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>One Africa.</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>One Payment Network.</div>
          <div style={{ fontSize: 30, marginTop: 24, opacity: 0.75 }}>Move, pay and connect across Africa.</div>
        </div>
      </div>
    ),
    size,
  )
}
