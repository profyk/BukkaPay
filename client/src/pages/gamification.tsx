import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Zap, Trophy, Award, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function Gamification() {
  const [activeTab, setActiveTab] = useState<"challenges" | "achievements">("challenges");

  const challenges = [
    {
      id: 1,
      title: "Save ₦5,000",
      description: "Don't spend more than ₦5,000 today",
      progress: 60,
      reward: 100,
      icon: "💰",
      completed: false,
    },
    {
      id: 2,
      title: "5 Transactions",
      description: "Make 5 different transactions",
      progress: 100,
      reward: 200,
      icon: "🔄",
      completed: true,
    },
    {
      id: 3,
      title: "Top-up Success",
      description: "Complete 3 successful top-ups",
      progress: 33,
      reward: 150,
      icon: "⬆️",
      completed: false,
    },
    {
      id: 4,
      title: "Weekly Savings",
      description: "Save 20% this week",
      progress: 85,
      reward: 300,
      icon: "📊",
      completed: false,
    },
  ];

  const achievements = [
    { title: "First Transaction", description: "Make your first payment", icon: "🎯", date: "Jan 1" },
    { title: "Saving Hero", description: "Reach Silver tier", icon: "🦸", date: "Jan 15" },
    { title: "Socializer", description: "Refer 5 friends", icon: "👥", date: "Jan 20" },
    { title: "Frequent User", description: "Use app 30 days in a row", icon: "📅", date: "Feb 1" },
    { title: "Big Spender", description: "Spend ₦100,000", icon: "💳", date: "Feb 10" },
    { title: "Bill Master", description: "Pay 10 bills on time", icon: "📄", date: "Feb 15" },
  ];

  const stats = {
    streak: 12,
    totalPoints: 2850,
    badges: 6,
    rank: "Silver",
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Gamification</h1>
      </header>

      <div className="px-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-orange-500 to-red-500 rounded-lg p-4 text-white"
            data-testid="stat-streak"
          >
            <Flame size={20} className="mb-2" />
            <p className="text-2xl font-bold">{stats.streak}</p>
            <p className="text-xs opacity-90">Day Streak</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-yellow-500 to-amber-500 rounded-lg p-4 text-white"
            data-testid="stat-badges"
          >
            <Trophy size={20} className="mb-2" />
            <p className="text-2xl font-bold">{stats.badges}</p>
            <p className="text-xs opacity-90">Badges Earned</p>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("challenges")}
            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
              activeTab === "challenges"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                : "bg-secondary"
            }`}
            data-testid="button-challenges-tab"
          >
            <Zap size={18} className="inline mr-2" />
            Challenges
          </button>
          <button
            onClick={() => setActiveTab("achievements")}
            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
              activeTab === "achievements"
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                : "bg-secondary"
            }`}
            data-testid="button-achievements-tab"
          >
            <Award size={18} className="inline mr-2" />
            Achievements
          </button>
        </div>

        {/* Challenges */}
        {activeTab === "challenges" && (
          <div className="space-y-3">
            {challenges.map((challenge, idx) => (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`p-4 rounded-lg border-2 ${
                  challenge.completed
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-secondary border-border"
                }`}
                data-testid={`challenge-${idx}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{challenge.icon}</span>
                    <div>
                      <p className="font-semibold">{challenge.title}</p>
                      <p className="text-xs text-muted-foreground">{challenge.description}</p>
                    </div>
                  </div>
                  {challenge.completed && <span className="text-emerald-500">✓</span>}
                </div>

                <div className="mb-2">
                  <div className="w-full bg-background rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full h-2 transition-all"
                      style={{ width: `${challenge.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{challenge.progress}% Complete</p>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">+{challenge.reward} points</span>
                  <Button
                    size="sm"
                    className={challenge.completed ? "opacity-50" : ""}
                    disabled={challenge.completed}
                    data-testid={`button-claim-${idx}`}
                  >
                    {challenge.completed ? "Claimed" : "Claim"}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Achievements */}
        {activeTab === "achievements" && (
          <div className="grid grid-cols-2 gap-3">
            {achievements.map((achievement, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-secondary rounded-lg p-4 text-center"
                data-testid={`achievement-${idx}`}
              >
                <p className="text-3xl mb-2">{achievement.icon}</p>
                <p className="font-semibold text-sm mb-1">{achievement.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{achievement.description}</p>
                <p className="text-xs text-violet-600 font-medium">{achievement.date}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
