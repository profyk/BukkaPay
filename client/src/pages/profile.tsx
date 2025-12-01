import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Zap, CheckCircle2, Edit3, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

export default function Profile() {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);

  const copyWalletID = () => {
    navigator.clipboard.writeText("BKP-A4M2K9L7");
    setCopied(true);
    toast.success("Wallet ID copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-md z-10 flex items-center justify-between">
        <h1 className="font-heading font-bold text-2xl">Profile</h1>
        <button
          onClick={() => toast.info("Edit profile coming soon")}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
          data-testid="button-edit-profile"
        >
          <Edit3 size={20} />
        </button>
      </header>

      {/* Profile Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-6 mb-6 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-6 text-white"
        data-testid="card-profile"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold border-2 border-white/30">
              AM
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">Alex Morgan</h2>
              <p className="text-blue-100 text-sm">alex.morgan@example.com</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
            <CheckCircle2 size={14} />
            <span className="text-xs font-semibold">Verified</span>
          </div>
        </div>

        {/* Wallet ID */}
        <div className="bg-white/10 rounded-lg p-3 flex items-center justify-between border border-white/20">
          <div>
            <p className="text-xs text-blue-100 mb-1">Wallet ID</p>
            <p className="font-mono font-bold text-sm">BKP-A4M2K9L7</p>
          </div>
          <button
            onClick={copyWalletID}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            data-testid="button-copy-id"
          >
            <Copy size={18} />
          </button>
        </div>
      </motion.div>

      {/* Account Stats */}
      <div className="px-6 grid grid-cols-3 gap-3 mb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-secondary rounded-lg p-4 text-center"
          data-testid="stat-balance"
        >
          <p className="text-2xl font-bold">$2,456</p>
          <p className="text-xs text-muted-foreground mt-1">Wallet Balance</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-secondary rounded-lg p-4 text-center"
          data-testid="stat-transactions"
        >
          <p className="text-2xl font-bold">142</p>
          <p className="text-xs text-muted-foreground mt-1">Transactions</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-secondary rounded-lg p-4 text-center"
          data-testid="stat-rewards"
        >
          <p className="text-2xl font-bold text-amber-600">850</p>
          <p className="text-xs text-muted-foreground mt-1">Loyalty Points</p>
        </motion.div>
      </div>

      {/* Account Status */}
      <div className="px-6 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-600">Account Verified</p>
            <p className="text-xs text-emerald-600/70">Your account is fully verified and secure</p>
          </div>
        </div>
      </div>

      {/* Tier Badge */}
      <div className="px-6 mb-6">
        <p className="text-xs text-muted-foreground font-medium mb-2">ACCOUNT TIER</p>
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg">
          <Zap size={24} className="text-amber-600" />
          <div className="flex-1">
            <p className="font-bold text-sm">Premium Plus</p>
            <p className="text-xs text-muted-foreground">Higher limits & exclusive rewards</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground" />
        </div>
      </div>

      {/* Session Info */}
      <div className="px-6 text-center pt-6">
        <p className="text-xs text-muted-foreground">
          Last login: Today at 2:34 PM
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
