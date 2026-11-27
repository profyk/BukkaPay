import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme"

const OPTIONS: [ThemeChoice, string, typeof Sun][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]]

function isDark() {
  return document.documentElement.classList.contains("dark")
}

function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice())
  const [dark, setDark] = useState(isDark())
  useEffect(() => {
    const sync = () => { setChoice(getThemeChoice()); setDark(isDark()) }
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
    window.addEventListener("bukkapay-theme", sync)
    mq?.addEventListener?.("change", sync)
    return () => { window.removeEventListener("bukkapay-theme", sync); mq?.removeEventListener?.("change", sync) }
  }, [])
  const pick = (v: ThemeChoice) => { setThemeChoice(v); setChoice(v); setDark(isDark()) }
  return { choice, dark, pick }
}

/** Light / dark / follow-the-system switch for the board portal.
 *  `compact`: a single sun/moon button on phones, the full switch from sm up. */
export function ThemeToggle({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  const { choice, dark, pick } = useThemeChoice()
  const full = (
    <div role="radiogroup" aria-label="Theme"
      className={`inline-flex items-center rounded-full p-0.5 border ${onDark ? "border-white/15 bg-white/5" : "border-border bg-muted/60"}`}>
      {OPTIONS.map(([value, label, Icon]) => {
        const on = choice === value
        return (
          <button key={value} type="button" role="radio" aria-checked={on} aria-label={`${label} mode`} title={`${label} mode`}
            onClick={() => pick(value)}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${
              on ? (onDark ? "bg-white text-[#010C38]" : "bg-background text-foreground shadow-sm")
                 : (onDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}`}>
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
  if (!compact) return full
  const Icon = dark ? Sun : Moon
  return (
    <>
      <button type="button" onClick={() => pick(dark ? "light" : "dark")}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}
        className="sm:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-muted">
        <Icon className="w-4 h-4" />
      </button>
      <span className="hidden sm:inline-flex">{full}</span>
    </>
  )
}
