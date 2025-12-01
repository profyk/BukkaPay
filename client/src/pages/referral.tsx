import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Share2, Users, TrendingUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function Referral() {
  const referralCode = "BKP-JOHN92K";
  const referralLink = `https://bukkapay.com?ref=${referralCode}`;

  const referralData = {
    totalEarnings: 15750,
    totalReferrals: 12,
    pendingReferrals: 3,
    referralBonus: 500,
    references: [
      { name: "Amara Okafor", status: "completed", earnings: 500, date: "Jan 15" },
      { name: "Chioma Nwosu", status: "completed", earnings: 500, date: "Jan 10" },
      { name: "David Chukwu", status: "pending", earnings: 0, date: "Jan 5" },
      { name: "Zainab Hassan", status: "completed", earnings: 500, date: "Dec 28" },
    ],
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Referral Program</h1>
      </header>

      <div className="px-6 space-y-6">
        {/* Earnings Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl p-8 text-white text-center shadow-2xl shadow-emerald-500/20"
          data-testid="card-earnings"
        >
          <p className="text-emerald-100 text-sm mb-2">Total Earnings</p>
          <p className="text-5xl font-bold font-heading">₦{referralData.totalEarnings.toLocaleString()}</p>
          <p className="text-emerald-100 text-sm mt-4">
            {referralData.totalReferrals} successful referrals
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-secondary rounded-lg p-4"
            data-testid="stat-completed"
          >
            <TrendingUp size={20} className="text-emerald-500 mb-2" />
            <p className="text-2xl font-bold">{referralData.totalReferrals}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-secondary rounded-lg p-4"
            data-testid="stat-pending"
          >
            <Users size={20} className="text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{referralData.pendingReferrals}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </motion.div>
        </div>

        {/* Referral Link */}
        <div className="bg-secondary rounded-lg p-4">
          <p className="text-sm font-medium mb-2">Your Referral Code</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-background rounded px-3 py-2 font-mono text-sm">
              {referralCode}
            </div>
            <button
              onClick={copyToClipboard}
              className="p-2 rounded bg-primary text-white hover:bg-primary/90 transition-colors"
              data-testid="button-copy-code"
            >
              <Copy size={18} />
            </button>
          </div>

          <Button
            onClick={copyToClipboard}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/20"
            data-testid="button-share"
          >
            <Share2 size={18} className="mr-2" />
            Share Referral Link
          </Button>
        </div>

        {/* How it Works */}
        <div>
          <h2 className="text-lg font-bold mb-4">How It Works</h2>
          <div className="space-y-3">
            {[
              { num: 1, text: "Share your referral code with friends" },
              { num: 2, text: "They sign up using your code" },
              { num: 3, text: "Get ₦500 when they complete first transaction" },
              { num: 4, text: "Both of you get bonus rewards" },
            ].map((step) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: step.num * 0.1 }}
                className="flex items-center gap-3 p-3 bg-secondary rounded-lg"
                data-testid={`step-${step.num}`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
                  {step.num}
                </div>
                <p className="text-sm">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Referral History */}
        <div>
          <h2 className="text-lg font-bold mb-4">Your Referrals</h2>
          <div className="space-y-3">
            {referralData.references.map((ref, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                data-testid={`referral-${idx}`}
              >
                <div>
                  <p className="font-semibold text-sm">{ref.name}</p>
                  <p className="text-xs text-muted-foreground">{ref.date}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${ref.status === "completed" ? "text-emerald-500" : "text-yellow-500"}`}>
                    ₦{ref.earnings.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{ref.status}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
