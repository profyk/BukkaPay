import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation } from "wouter"
import { motion } from "framer-motion"
import { Loader2, Eye, EyeOff, FlaskConical } from "lucide-react"
import { loginSchema, type LoginInput, useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { enterDemoMode } from "@/lib/demo"

export default function Login() {
  const { login, isLoggingIn } = useAuth()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (data: LoginInput) => {
    try {
      await login(data)
      toast({
        title: "Welcome back",
        description: "Successfully signed in to BukkaPay Admin.",
      })
      setLocation("/")
    } catch (err: any) {
      toast({
        title: "Authentication Failed",
        description: err.response?.data?.message || "Invalid credentials or server error.",
        variant: "destructive",
      })
    }
  }

  const handleDemoMode = () => {
    enterDemoMode()
    toast({ title: "Demo Mode Active", description: "Exploring with sample data." })
    window.location.reload()
  }

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Form Section */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md space-y-10"
        >
          <div className="space-y-4">
            <img
              src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
              alt="BukkaPay Technologies"
              className="h-20 w-auto"
            />
            <h1 className="text-4xl font-display font-bold tracking-tight">Admin Portal</h1>
            <p className="text-lg text-muted-foreground">
              Sign in to manage users and transactions on BukkaPay.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Email Address</label>
                <Input
                  type="email"
                  placeholder="admin@bukkapay.com"
                  {...register("email")}
                  className={errors.email ? "border-destructive focus-visible:ring-destructive/10" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive font-medium">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...register("password")}
                    className={errors.password ? "border-destructive focus-visible:ring-destructive/10 pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive font-medium">{errors.password.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Button type="submit" className="w-full text-lg" size="lg" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : "Sign In"}
              </Button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full text-base"
                size="lg"
                onClick={handleDemoMode}
              >
                <FlaskConical className="w-5 h-5 mr-2 text-primary" />
                Preview in Demo Mode
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Demo mode uses sample data — no login required.
              </p>
            </div>
          </form>
        </motion.div>
      </div>

      {/* Right Image Section */}
      <div className="hidden lg:block relative w-1/2 bg-sidebar overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/90 to-sidebar/40 z-10" />
        <img
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="BukkaPay Abstract"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-16 text-primary-foreground">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <h2 className="text-4xl font-display font-bold mb-4">Empowering the next generation of finance.</h2>
            <p className="text-lg text-primary-foreground/70 max-w-lg">
              Secure, fast, and reliable transaction management infrastructure.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
