"use client"

/**
 * Till confirmation: watches for new incoming payments and announces them —
 * a big green banner, a chime and a spoken "Payment received: R150.00" —
 * so a busy counter never has to look at the screen to know it was paid.
 */
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { money } from "@/lib/format"

type Tx = { id: string; type: string; status: string; amount: string; payerName?: string; createdAt: string }

function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    ;[880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.15)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.15)
      o.stop(ctx.currentTime + i * 0.15 + 0.4)
    })
  } catch { /* audio not allowed until the user interacts */ }
}

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    window.speechSynthesis?.speak(u)
  } catch { /* speech unavailable */ }
}

export function PaymentAlert({ merchantId, currency }: { merchantId: string; currency?: string }) {
  const seen = useRef<Set<string> | null>(null)
  const [latest, setLatest] = useState<Tx | null>(null)
  const [sound, setSound] = useState(true)

  useEffect(() => {
    try { setSound(localStorage.getItem("bkp_till_sound") !== "off") } catch { /* storage unavailable */ }
  }, [])

  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const r = await api<{ transactions: Tx[] }>(`/merchants/${merchantId}/transactions/search?type=payment&limit=10`)
        const ids = new Set(r.transactions.map((t) => t.id))
        if (seen.current === null) { seen.current = ids; return }  // first load: don't announce history
        const fresh = r.transactions.filter((t) => !seen.current!.has(t.id) && t.status === "completed")
        seen.current = new Set([...seen.current, ...ids])
        if (fresh.length) {
          const t = fresh[0]
          setLatest(t)
          if (sound) {
            chime()
            speak(`Payment received: ${money(t.amount, currency)}`.replace("R", "R "))
          }
          setTimeout(() => setLatest((cur) => (cur?.id === t.id ? null : cur)), 12000)
        }
      } catch { /* offline: try again next tick */ }
    }
    tick()
    const h = setInterval(() => { if (!stop && document.visibilityState === "visible") tick() }, 4000)
    return () => { stop = true; clearInterval(h) }
  }, [merchantId, currency, sound])

  const toggle = () => {
    const next = !sound
    setSound(next)
    try { localStorage.setItem("bkp_till_sound", next ? "on" : "off") } catch { /* storage unavailable */ }
  }

  return (
    <>
      <button onClick={toggle} className="fixed bottom-4 right-4 z-40 rounded-full bg-white px-4 py-2 text-xs font-semibold shadow-lg ring-1 ring-black/10 dark:bg-[#15151f]"
        aria-pressed={sound} aria-label="Payment sound">{sound ? "🔊 Till sound on" : "🔇 Till sound off"}</button>
      {latest && (
        <div role="status" aria-live="assertive" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-2xl bg-emerald-600 p-5 text-center text-white shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Payment received</p>
          <p className="mt-1 font-display text-4xl font-bold">{money(latest.amount, currency)}</p>
          {latest.payerName && <p className="mt-1 text-sm text-emerald-100">from {latest.payerName}</p>}
        </div>
      )}
    </>
  )
}
