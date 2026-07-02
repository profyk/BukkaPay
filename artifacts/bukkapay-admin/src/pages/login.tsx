import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Eye, EyeOff, ShieldCheck, AlertCircle, Lock, ArrowRightLeft, Users, Wallet } from "lucide-react"
import { loginSchema, type LoginInput, useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const FEATURES = [
  { icon: Users,           text: "Full user lifecycle management" },
  { icon: ArrowRightLeft,  text: "Real-time transaction oversight" },
  { icon: Wallet,          text: "Wallet freeze, block & balance control" },
  { icon: ShieldCheck,     text: "Role-based admin access control" },
]

export default function Login() {
  const { login, isLoggingIn } = useAuth()
  const [, setLocation] = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginInput) => {
    setLoginError(null)
    try {
      await login(data)
      setLocation("/")
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Invalid credentials. Please try again."
      setLoginError(msg)
    }
  }

  return (
    <div className="min-h-screen w-full flex">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex flex-col w-[480px] shrink-0 relative overflow-hidden bg-[#0f1729]">
        {/* Geometric grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99,102,241,0.8) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,0.8) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full bg-indigo-600/20 blur-[80px]" />
        <div className="absolute bottom-[-60px] right-[-60px] w-64 h-64 rounded-full bg-violet-600/20 blur-[60px]" />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="mb-auto">
            <img
              src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
              alt="BukkaPay"
              className="h-10 w-auto brightness-200"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          </div>

          {/* Headline */}
          <div className="mb-12 space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <p className="text-xs font-bold tracking-[0.2em] text-indigo-400 uppercase mb-3">BukkaPay Operations Centre</p>
              <h1 className="text-4xl font-bold text-white leading-tight">
                Manage your<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                  entire fintech
                </span><br />
                from one place.
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-slate-400 text-sm leading-relaxed max-w-xs"
            >
              Authorised admin access only. All sessions are logged and monitored for compliance.
            </motion.p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-sm text-slate-300">{text}</span>
              </motion.div>
            ))}
          </div>

          <p className="mt-8 text-xs text-slate-600">
            © {new Date().getFullYear()} BukkaPay Technologies. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <img
              src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
              alt="BukkaPay"
              className="h-10 w-auto"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          </div>

          {/* Header */}
          <div className="mb-8 space-y-1.5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Secure Admin Access</span>
            </div>
            <h2 className="text-3xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground">Sign in to the BukkaPay Admin Portal</p>
          </div>

          {/* Inline error */}
          <AnimatePresence>
            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="overflow-hidden mb-5"
              >
                <div className="flex items-start gap-3 bg-destructive/8 border border-destructive/25 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive font-medium">{loginError}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Email Address</label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="admin@bukkapay.com"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-xs text-destructive font-medium">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                  className={`pr-10 ${errors.password ? "border-destructive" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive font-medium">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating…</>
              ) : (
                <><Lock className="w-4 h-4 mr-2" />Sign In</>
              )}
            </Button>
          </form>

          {/* Security notice */}
          <div className="mt-8 flex items-start gap-2.5 bg-muted/50 border border-border rounded-xl px-4 py-3">
            <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This portal is restricted to authorised BukkaPay administrators only. Unauthorised access is strictly prohibited and will be reported. All activity is logged.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
