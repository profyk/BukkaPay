import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARDS } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Transfer() {
  const [amount, setAmount] = useState("0");
  const [fromCard, setFromCard] = useState(CARDS[0]);
  const [toCard, setToCard] = useState(CARDS[1]);

  const handleNumberClick = (num: string) => {
    if (amount === "0" && num !== ".") {
      setAmount(num);
    } else {
      if (num === "." && amount.includes(".")) return;
      setAmount(amount + num);
    }
  };

  const handleBackspace = () => {
    if (amount.length === 1) {
      setAmount("0");
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Transfer Money</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-4 pb-8">
        
        {/* Card Selection */}
        <div className="flex flex-col space-y-4 mb-8">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border cursor-pointer hover:bg-secondary transition-colors">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${fromCard.color} flex items-center justify-center text-white`}>
                <fromCard.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">From</p>
                <p className="font-medium text-sm">{fromCard.title}</p>
              </div>
            </div>
            <ChevronDown size={16} className="text-muted-foreground" />
          </div>

          <div className="flex justify-center -my-2 z-10">
            <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground">
               <ArrowRight size={14} className="rotate-90" />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/50 border border-border cursor-pointer hover:bg-secondary transition-colors">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${toCard.color} flex items-center justify-center text-white`}>
                <toCard.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">To</p>
                <p className="font-medium text-sm">{toCard.title}</p>
              </div>
            </div>
            <ChevronDown size={16} className="text-muted-foreground" />
          </div>
        </div>

        {/* Amount Display */}
        <div className="flex-1 flex items-center justify-center mb-8">
          <div className="text-center">
             <span className="text-4xl font-bold text-muted-foreground mr-1">$</span>
             <span className="text-6xl font-bold font-heading tracking-tighter">{amount}</span>
          </div>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0].map((num) => (
            <motion.button
              key={num}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleNumberClick(num.toString())}
              className="h-16 rounded-xl text-2xl font-medium hover:bg-secondary/50 transition-colors"
            >
              {num}
            </motion.button>
          ))}
          <motion.button
             whileTap={{ scale: 0.9 }}
             onClick={handleBackspace}
             className="h-16 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={24} />
          </motion.button>
        </div>

        <Button className="w-full h-14 text-lg rounded-xl shadow-lg shadow-primary/20">
          Review Transfer
        </Button>
      </div>
    </div>
  );
}
