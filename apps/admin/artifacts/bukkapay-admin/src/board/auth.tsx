import { useState, type InputHTMLAttributes, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, Eye, EyeOff, Lock, Loader2, Mail, ShieldCheck } from "lucide-react"

/* The customer app sign-in layout (apps/customer/pages/login.tsx +
   components/AuthHero.tsx), branded for BukkaPay Boardroom: midnight navy
   hero, emerald actions, a gold rule. Invite-only, so no sign-up or social
   sign-in. Sign-in is password + authenticator app code. */

// Admin panel → Board & Investors, where the owner opens the Boardroom.
const OWNER_ENTRY = (import.meta.env.VITE_ADMIN_WEB_URL || "https://admin.bukkapay.com").replace(/\/$/, "") + "/board-portal"

export const ICON = "/icons/icon-512.png" // same file as apps/customer/assets/logo.png

export function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-white text-[#1A1A2E] dark:bg-[#0D0D1A] dark:text-[#F1F1FF]">
      {/* AuthHero */}
      <header className="relative overflow-hidden rounded-b-[32px] bg-[#0A1630] px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))] pb-16">
        <div aria-hidden className="absolute -top-[120px] -right-20 h-[280px] w-[280px] rounded-full bg-[rgba(16,185,129,0.28)]" />
        <div aria-hidden className="absolute -bottom-[140px] -left-[100px] h-[300px] w-[300px] rounded-full bg-[rgba(201,162,39,0.16)]" />
        <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center">
          <img src={ICON} alt="BukkaPay" className="h-[72px] w-[72px] rounded-[18px]" />
          <p className="mt-3.5 text-[26px] font-extrabold tracking-[-0.5px] text-white">BukkaPay <span className="text-[#C9A227]">Boardroom</span></p>
          <span aria-hidden className="mt-2 h-px w-16 bg-gradient-to-r from-transparent via-[#C9A227] to-transparent" />
          <p className="mt-2 text-center text-[15px] text-white/[0.72]">Financial Intelligence. Transparency. Growth.</p>
          <div className="mt-[18px] flex flex-wrap justify-center gap-2">
            {["Directors", "Investors", "Shareholders", "By invitation only"].map((c) => (
              <span key={c} className="rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/[0.85]">{c}</span>
            ))}
          </div>
        </div>
      </header>

      {/* Card */}
      <main className="relative mx-auto -mt-10 w-[92%] max-w-[480px] rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:border-[#2D2D45] dark:bg-[#1E1E30]">
        <h1 className="mb-2 text-center text-[28px] font-bold">{title}</h1>
        <p className="mb-7 text-center text-sm text-[#9CA3AF] dark:text-[#6B6B90]">{subtitle}</p>
        {children}
        <div className="my-6 flex items-center">
          <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2D2D45]" />
          <ShieldCheck className="mx-3 h-4 w-4 text-[#0B8F63] dark:text-[#10B981]" />
          <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2D2D45]" />
        </div>
        <p className="mt-2 text-center text-sm text-[#9CA3AF] dark:text-[#6B6B90]">
          Restricted to BukkaPay's directors, investors and shareholders. Access is by invitation, and every sign-in needs your authenticator app.
        </p>
        <p className="mt-3 text-center text-xs text-[#9CA3AF] dark:text-[#6B6B90]">
          Owner or super admin? You sign in with your admin account, not a Boardroom password.
        </p>
        {/* The owner's admin sign-in (password + authenticator) issues a single-use pass into the Boardroom. */}
        <a href={OWNER_ENTRY} className="mt-3 flex w-full items-center justify-center rounded-xl border border-[#0B8F63] py-3 text-sm font-semibold text-[#0B8F63] dark:border-[#10B981] dark:text-[#10B981]">
          Owner sign-in via the admin panel
        </a>
      </main>

      <footer className="mt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-2xl font-bold">BukkaPay</p>
        <p className="mt-1 text-sm italic text-[#9CA3AF] dark:text-[#6B6B90]">Confidential · for authorised members only</p>
      </footer>
    </div>
  )
}

const boxCls = "flex items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] dark:border-[#2D2D45] dark:bg-[#252538]"
const fieldCls = "min-w-0 flex-1 bg-transparent px-2.5 py-3.5 text-base text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] dark:text-[#F1F1FF] dark:placeholder:text-[#6B6B90]"
const iconCls = "ml-3 h-5 w-5 shrink-0 text-[#9CA3AF] dark:text-[#6B6B90]"

export function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="mb-1 block">
      <span className="mb-2 block text-sm font-medium">{text}</span>
      {children}
    </label>
  )
}

export function TextInput({ icon: Icon, ...props }: { icon: typeof Mail } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={boxCls}>
      <Icon className={iconCls} />
      <input {...props} className={fieldCls} />
    </div>
  )
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className={boxCls}>
      <Lock className={iconCls} />
      <input {...props} type={show ? "text" : "password"} className={fieldCls} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
        className="py-3.5 pr-3 text-[#9CA3AF] dark:text-[#6B6B90]">
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

export function Submit({ busy, disabled, busyText, children }: { busy: boolean; disabled?: boolean; busyText: string; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled} aria-label={busy ? busyText : undefined}
      className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#0B8F63] hover:bg-[#09784f] py-4 text-lg font-semibold text-white disabled:opacity-60">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  )
}

export function ErrorBox({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/30 dark:bg-red-500/10">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-200">{text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

