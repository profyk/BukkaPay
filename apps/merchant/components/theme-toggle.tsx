"use client"

import { useEffect, useState } from "react"

type Choice = "light" | "dark" | "system"
const KEY = "bukkapay_theme"

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}

/** Light / Dark / System, remembered in this browser (applied before paint in app/layout.tsx). */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system")
  useEffect(() => {
    const saved = localStorage.getItem(KEY)
    setChoice(saved === "light" || saved === "dark" ? saved : "system")
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => { if (!localStorage.getItem(KEY)) apply("system") }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  const pick = (c: Choice) => {
    if (c === "system") localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, c)
    setChoice(c)
    apply(c)
  }
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-line bg-white p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
      {(["light", "dark", "system"] as Choice[]).map((c) => (
        <button key={c} role="radio" aria-checked={choice === c} onClick={() => pick(c)}
                className={`rounded-lg px-2.5 py-1 font-medium capitalize ${choice === c ? "bg-brand-600 text-white" : "text-ink-soft hover:text-ink dark:text-white/60 dark:hover:text-white"}`}>
          {c === "light" ? "☀ Light" : c === "dark" ? "☾ Dark" : "System"}
        </button>
      ))}
    </div>
  )
}
