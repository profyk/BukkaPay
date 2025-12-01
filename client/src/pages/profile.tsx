import { useState } from "react";
import { useLocation } from "wouter";
import { User, Shield, Bell, HelpCircle, LogOut, ChevronRight, QrCode, CreditCard, Zap, CheckCircle2, AlertCircle, Edit3, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { logout } from "@/lib/auth";

export default function Profile() {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);

  const handleLogout = async () => {
    logout();
    navigate?.("/login");
  };

  const handleMyID = () => {
    navigate?.("/my-id");
  };

  const copyWalletID = () => {
    navigator.clipboard.writeText("BKP-A4M2K9L7");
    setCopied(true);
    toast.success("Wallet ID copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const menuItems = [
    { icon: QrCode, label: "My ID Code", onClick: handleMyID, color: "text-blue-600" },
    { icon: User, label: "Personal Information", onClick: () => toast.info("Coming soon"), color: "text-purple-600" },
    { icon: Shield, label: "Security & Privacy", onClick: () => toast.info("Coming soon"), color: "text-orange-600" },
    { icon: CreditCard, label: "Payment Methods", onClick: () => toast.info("Coming soon"), color: "text-emerald-600" },
    { icon: Bell, label: "Notifications", onClick: () => toast.info("Coming soon"), color: "text-cyan-600" },
    { icon: HelpCircle, label: "Help & Support", onClick: () => toast.info("Coming soon"), color: "text-pink-600" },
  ];

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

      {/* Menu Section */}
      <div className="px-6 mb-4">
        <p className="text-xs text-muted-foreground font-medium mb-3">ACCOUNT SETTINGS</p>
        <div className="space-y-2">
          {menuItems.map((item) => (
            <motion.button
              key={item.label}
              onClick={item.onClick}
              whileHover={{ x: 4 }}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-secondary transition-colors group"
              data-testid={`button-${item.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full bg-secondary group-hover:bg-background flex items-center justify-center transition-colors ${item.color}`}>
                  <item.icon size={20} />
                </div>
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              <ChevronRight size={18} className="text-muted-foreground" />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Logout Button */}
      <div className="px-6">
        <motion.button
          onClick={handleLogout}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30 transition-colors mt-2"
          data-testid="button-logout"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-600">
              <LogOut size={20} />
            </div>
            <span className="font-medium">Log Out</span>
          </div>
          <ChevronRight size={18} />
        </motion.button>

        {/* Session Info */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          Last login: Today at 2:34 PM
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
