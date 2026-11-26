import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme"

const OPTIONS: [ThemeChoice, string, typeof Sun][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]]

/** Light / dark / follow-the-system switch for the board portal. */
export function ThemeToggle({ onDark = false }: { onDark?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice())
  useEffect(() => {
    const sync = () => setChoice(getThemeChoice())
    window.addEventListener("bukkapay-theme", sync)
    return () => window.removeEventListener("bukkapay-theme", sync)
  }, [])
  return (
    <div role="radiogroup" aria-label="Theme"
      className={`inline-flex items-center rounded-full p-0.5 border ${onDark ? "border-white/15 bg-white/5" : "border-border bg-muted/60"}`}>
      {OPTIONS.map(([value, label, Icon]) => {
        const on = choice === value
        return (
          <button key={value} type="button" role="radio" aria-checked={on} aria-label={label} title={label}
            onClick={() => { setThemeChoice(value); setChoice(value) }}
            className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${
              on ? (onDark ? "bg-white text-[#010C38]" : "bg-background text-foreground shadow-sm")
                 : (onDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}`}>
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}
