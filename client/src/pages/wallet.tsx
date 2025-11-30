import BottomNav from "@/components/BottomNav";
import WalletCard from "@/components/WalletCard";
import { CARDS } from "@/lib/mockData";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export default function Wallet() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="font-heading font-bold text-2xl">My Cards</h1>
        <p className="text-muted-foreground text-sm">Manage your budgeting cards</p>
      </header>

      <div className="px-6 space-y-6 mt-4">
        {CARDS.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <WalletCard {...card} />
            <div className="mt-3 flex justify-between items-center px-1">
              <div className="text-sm font-medium">{card.title} Budget</div>
              <div className="text-xs text-muted-foreground">
                Spent <span className="text-foreground font-semibold">$340.00</span> / $1000
              </div>
            </div>
            {/* Simple Progress Bar */}
            <div className="h-2 bg-secondary rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full" 
                style={{ width: `${(index + 1) * 20}%`, backgroundColor: index % 2 === 0 ? 'var(--color-primary)' : 'var(--color-chart-2)' }}
              />
            </div>
          </motion.div>
        ))}

        <button className="w-full py-4 rounded-2xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 transition-all gap-2 font-medium">
          <Plus size={20} />
          Add New Card
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
