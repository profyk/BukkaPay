import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Mail, Lock, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { login } from "@/lib/auth";
import logoUrl from "@assets/file_000000000540722fb204f238188c2387_1764495081777.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [useBiometric, setUseBiometric] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: any) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await login(formData.email, formData.password);
      navigate?.("/");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    // This is a placeholder for biometric authentication
    // In a real app, this would use WebAuthn API or native biometric
    toast({ title: "Info", description: "Biometric authentication available on mobile app", variant: "default" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-card rounded-3xl shadow-2xl p-8 border border-border">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img src={logoUrl} alt="BukkaPay" className="w-16 h-16 rounded-2xl" />
          </div>

          <h1 className="text-3xl font-heading font-bold text-center mb-2">Welcome Back</h1>
          <p className="text-center text-muted-foreground text-sm mb-8">Sign in to your BukkaPay account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-muted-foreground" size={20} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="input-login-email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Password</label>
                <Link href="/forgot-password">
                  <span className="text-xs text-primary hover:underline cursor-pointer">Forgot?</span>
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-muted-foreground" size={20} />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="input-login-password"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full h-12 text-lg rounded-xl font-semibold"
              data-testid="button-login"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Biometric Option */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-card text-muted-foreground">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBiometric}
              className="w-full mt-6 flex items-center justify-center gap-3 py-3 rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all font-semibold"
              data-testid="button-biometric"
            >
              <Fingerprint size={20} className="text-primary" />
              <span>Use Biometric</span>
            </button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Don't have an account?{" "}
            <Link href="/signup">
              <span className="text-primary font-semibold hover:underline cursor-pointer">Sign Up</span>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
