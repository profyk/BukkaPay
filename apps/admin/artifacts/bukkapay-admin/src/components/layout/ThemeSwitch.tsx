import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme"

const OPTIONS: { value: ThemeChoice; label: string; icon: any }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/** Light / Dark / System, remembered in this browser. */
export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice())
  useEffect(() => {
    const sync = () => setChoice(getThemeChoice())
    window.addEventListener("bukkapay-theme", sync)
    return () => window.removeEventListener("bukkapay-theme", sync)
  }, [])
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} role="radio" aria-checked={choice === value} title={label}
                onClick={() => { setThemeChoice(value); setChoice(value) }}
                className={cn("flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition",
                  choice === value ? "bg-violet-600 text-white shadow" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      ))}
    </div>
  )
}
