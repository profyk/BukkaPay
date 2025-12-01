import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, TrendingUp, Target, AlertCircle, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

export default function Analytics() {
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">("month");

  const analyticsData = {
    totalSpent: 45230,
    budgetLimit: 50000,
    percentUsed: (45230 / 50000) * 100,
    byCategory: [
      { name: "Food & Groceries", amount: 12500, percentage: 27.6, icon: "🛒", limit: 15000 },
      { name: "Transport", amount: 8950, percentage: 19.8, icon: "🚗", limit: 10000 },
      { name: "Entertainment", amount: 9200, percentage: 20.3, icon: "🎬", limit: 12000 },
      { name: "Bills & Utilities", amount: 7800, percentage: 17.2, icon: "📄", limit: 10000 },
      { name: "Other", amount: 6780, percentage: 15, icon: "💳", limit: 5000 },
    ],
    trends: [
      { week: "W1", amount: 8900 },
      { week: "W2", amount: 10200 },
      { week: "W3", amount: 11800 },
      { week: "W4", amount: 14330 },
    ],
    alerts: [
      { type: "warning", message: "You've spent 90% of your grocery budget" },
      { type: "info", message: "Average spending this week is 25% higher than last week" },
      { type: "success", message: "Saved ₦5,000 on transport this month" },
    ],
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Spending Analytics</h1>
      </header>

      <div className="px-6 space-y-6">
        {/* Timeframe Selector */}
        <div className="flex gap-2">
          {(["week", "month", "year"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                timeframe === tf
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                  : "bg-secondary"
              }`}
              data-testid={`button-timeframe-${tf}`}
            >
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </button>
          ))}
        </div>

        {/* Budget Overview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white"
          data-testid="card-budget"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-300 text-sm">Total Spent</p>
              <p className="text-3xl font-bold">₦{analyticsData.totalSpent.toLocaleString()}</p>
            </div>
            <BarChart3 size={32} className="text-violet-400" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Budget Usage</span>
              <span>{analyticsData.percentUsed.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full h-3 transition-all"
                style={{ width: `${analyticsData.percentUsed}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              ₦{(analyticsData.budgetLimit - analyticsData.totalSpent).toLocaleString()} remaining
            </p>
          </div>
        </motion.div>

        {/* Spending by Category */}
        <div>
          <h2 className="text-lg font-bold mb-4">Spending by Category</h2>
          <div className="space-y-3">
            {analyticsData.byCategory.map((cat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-secondary rounded-lg p-4"
                data-testid={`category-${idx}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <p className="font-semibold text-sm">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">Budget: ₦{cat.limit.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₦{cat.amount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{cat.percentage}%</p>
                  </div>
                </div>

                <div className="w-full bg-background rounded-full h-2">
                  <div
                    className={`rounded-full h-2 transition-all ${
                      (cat.amount / cat.limit) * 100 > 90
                        ? "bg-red-500"
                        : (cat.amount / cat.limit) * 100 > 75
                        ? "bg-yellow-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min((cat.amount / cat.limit) * 100, 100)}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div>
          <h2 className="text-lg font-bold mb-4">Insights & Alerts</h2>
          <div className="space-y-3">
            {analyticsData.alerts.map((alert, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  alert.type === "warning"
                    ? "bg-yellow-500/10 border border-yellow-500/20"
                    : alert.type === "info"
                    ? "bg-blue-500/10 border border-blue-500/20"
                    : "bg-emerald-500/10 border border-emerald-500/20"
                }`}
                data-testid={`alert-${idx}`}
              >
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <p className="text-sm">{alert.message}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
