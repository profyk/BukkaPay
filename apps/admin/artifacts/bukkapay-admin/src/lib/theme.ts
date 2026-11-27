/** Light / dark / system theme for the admin console. The choice is kept
 *  in this browser; "system" follows the operating system setting live. */
export type ThemeChoice = "light" | "dark" | "system"

const KEY = "bukkapay_admin_theme"

export function getThemeChoice(): ThemeChoice {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null
  return v === "light" || v === "dark" ? v : "system"
}

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()) {
  const dark = choice === "dark" || (choice === "system" && systemDark())
  document.documentElement.classList.toggle("dark", !!dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
  // Boardroom: the phone browser bar follows the mode too.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && document.documentElement.classList.contains("boardroom")) meta.setAttribute("content", dark ? "#060C1F" : "#0A1630")
}

export function setThemeChoice(choice: ThemeChoice) {
  localStorage.setItem(KEY, choice)
  applyTheme(choice)
  window.dispatchEvent(new Event("bukkapay-theme"))
}

/** Call once at start-up: applies the theme and follows OS changes in "system". */
export function initTheme() {
  applyTheme()
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getThemeChoice() === "system") applyTheme("system")
  })
}
