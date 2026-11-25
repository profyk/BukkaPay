import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "BukkaPay — One Africa. One Payment Network."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpengraphImage() {
  const logo = await fetch(new URL("../public/logo.png", import.meta.url)).then((r) => r.arrayBuffer())
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
                    padding: 72, background: "linear-gradient(135deg, #02145A 0%, #0A2FD8 100%)", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 38, fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo as unknown as string} width={64} height={64} />
          BukkaPay
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>One Africa.</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>One Payment Network.</div>
          <div style={{ fontSize: 30, marginTop: 24, opacity: 0.8 }}>Move, pay and connect across Africa.</div>
        </div>
      </div>
    ),
    size,
  )
}
