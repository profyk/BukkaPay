import { motion } from "framer-motion";
import WalletCard from "@/components/WalletCard";
import TransactionList from "@/components/TransactionList";
import ActionButtons from "@/components/ActionButtons";
import BottomNav from "@/components/BottomNav";
import { CARDS } from "@/lib/mockData";
import { Bell, Search } from "lucide-react";
import logoUrl from "@assets/file_000000000540722fb204f238188c2387_1764495081777.png";

export default function Home() {
  const mainCard = CARDS[0];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="px-6 pt-12 pb-4 flex justify-between items-center bg-background sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <img src={logoUrl} alt="BukkaPay Logo" className="w-10 h-10 rounded-xl object-contain" />
          <div>
            <p className="text-xs text-muted-foreground">Welcome back,</p>
            <h1 className="font-heading font-bold text-xl">Alex Morgan</h1>
          </div>
        </div>
        <div className="flex space-x-3">
          <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Search size={20} />
          </button>
          <button className="relative w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
          </button>
        </div>
      </header>

      <div className="px-6 space-y-8">
        {/* Main Card */}
        <section>
          <WalletCard {...mainCard} className="shadow-primary/20 shadow-2xl" />
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
          <ActionButtons />
        </section>

        {/* Recent Activity */}
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold">Recent Activity</h2>
            <button className="text-sm text-primary font-medium hover:underline">See All</button>
          </div>
          <TransactionList limit={3} />
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
