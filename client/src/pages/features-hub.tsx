import { Link } from "wouter";
import { ArrowLeft, Gift, BarChart3, Users, Zap, MessageCircle, Split, Lock, Users2 } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  { icon: Gift, label: "Loyalty Rewards", href: "/loyalty", color: "from-violet-600 to-indigo-600" },
  { icon: BarChart3, label: "Analytics", href: "/analytics", color: "from-blue-600 to-cyan-600" },
  { icon: Users, label: "Referral Program", href: "/referral", color: "from-emerald-600 to-teal-600" },
  { icon: Zap, label: "Gamification", href: "/gamification", color: "from-orange-600 to-red-600" },
  { icon: MessageCircle, label: "Support Chat", href: "/support-chat", color: "from-pink-600 to-rose-600" },
  { icon: Split, label: "Bill Splitting", href: "/bill-split", color: "from-indigo-600 to-purple-600" },
  { icon: Lock, label: "Security Settings", href: "/security", color: "from-slate-600 to-gray-600" },
];

export default function FeaturesHub() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Explore Features</h1>
      </header>

      <div className="px-6 space-y-6">
        <p className="text-center text-muted-foreground text-sm">Discover all premium features in BukkaPay</p>

        <div className="grid grid-cols-2 gap-3">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Link key={idx} href={feature.href}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`bg-gradient-to-br ${feature.color} rounded-xl p-6 text-white text-center cursor-pointer shadow-lg hover:shadow-xl transition-shadow`}
                  data-testid={`feature-${idx}`}
                >
                  <Icon size={32} className="mx-auto mb-2" />
                  <p className="font-semibold text-sm">{feature.label}</p>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
