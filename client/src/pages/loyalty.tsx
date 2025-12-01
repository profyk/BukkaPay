import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Gift, Star, TrendingUp, Zap, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function Loyalty() {
  const [selectedRedemption, setSelectedRedemption] = useState<string | null>(null);

  const loyaltyData = {
    points: 2850,
    tier: "Silver",
    nextTier: "Gold",
    pointsToNextTier: 1150,
    rewards: [
      { id: 1, name: "₦500 Credit", cost: 500, icon: "💳", description: "Add to any card" },
      { id: 2, name: "₦1000 Airtime", cost: 1000, icon: "📱", description: "Any network" },
      { id: 3, name: "50% Data Discount", cost: 2000, icon: "📡", description: "Next purchase" },
      { id: 4, name: "Free Bill Payment", cost: 1500, icon: "📄", description: "Any bill" },
    ],
    recentTransactions: [
      { description: "Airtime purchase", points: 100, date: "Today" },
      { description: "Data top-up", points: 150, date: "Yesterday" },
      { description: "Electricity bill", points: 200, date: "2 days ago" },
    ],
  };

  const tierBenefits = [
    { tier: "Bronze", min: 0, benefits: ["1 point per ₦10 spent", "Basic support"] },
    { tier: "Silver", min: 1000, benefits: ["1.5 points per ₦10 spent", "Priority support", "5% cashback"] },
    { tier: "Gold", min: 5000, benefits: ["2 points per ₦10 spent", "VIP support", "10% cashback", "Free premium features"] },
    { tier: "Platinum", min: 10000, benefits: ["3 points per ₦10 spent", "Dedicated support", "15% cashback", "Exclusive events"] },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Loyalty Rewards</h1>
      </header>

      <div className="px-6 space-y-6">
        {/* Points Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-8 text-white text-center shadow-2xl shadow-violet-500/20"
          data-testid="card-points"
        >
          <p className="text-violet-100 text-sm mb-2">Your Points Balance</p>
          <p className="text-6xl font-bold font-heading mb-4">{loyaltyData.points.toLocaleString()}</p>
          <p className="text-violet-100 text-sm mb-4">
            {loyaltyData.pointsToNextTier} points to {loyaltyData.nextTier}
          </p>
          <div className="w-full bg-white/20 rounded-full h-2 mb-6">
            <div
              className="bg-white rounded-full h-2"
              style={{
                width: `${((loyaltyData.points % 5000) / 5000) * 100}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 bg-white/10 rounded-lg py-2">
            <Crown size={18} />
            <span className="font-semibold">{loyaltyData.tier} Member</span>
          </div>
        </motion.div>

        {/* Tier Benefits */}
        <div>
          <h2 className="text-lg font-bold mb-4">Membership Tiers</h2>
          <div className="space-y-3">
            {tierBenefits.map((t, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`p-4 rounded-lg ${
                  t.tier === loyaltyData.tier
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    : "bg-secondary"
                }`}
                data-testid={`tier-${idx}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold">{t.tier}</p>
                  <span className="text-xs opacity-75">{t.min.toLocaleString()}+ points</span>
                </div>
                <ul className="text-xs space-y-1 opacity-90">
                  {t.benefits.map((b, i) => (
                    <li key={i}>✓ {b}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Redeem Rewards */}
        <div>
          <h2 className="text-lg font-bold mb-4">Redeem Rewards</h2>
          <div className="grid grid-cols-2 gap-3">
            {loyaltyData.rewards.map((reward) => (
              <motion.button
                key={reward.id}
                onClick={() => setSelectedRedemption(reward.id.toString())}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`p-4 rounded-lg transition-all ${
                  selectedRedemption === reward.id.toString()
                    ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
                data-testid={`reward-${reward.id}`}
              >
                <p className="text-2xl mb-2">{reward.icon}</p>
                <p className="font-semibold text-sm">{reward.name}</p>
                <p className="text-xs opacity-75">{reward.cost} pts</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-bold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {loyaltyData.recentTransactions.map((tx, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                data-testid={`transaction-${idx}`}
              >
                <div>
                  <p className="font-medium text-sm">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <p className="font-bold text-violet-600">+{tx.points}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Button className="w-full h-14 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20" data-testid="button-redeem">
          <Gift size={18} className="mr-2" />
          Redeem Now
        </Button>
      </div>
    </div>
  );
}
