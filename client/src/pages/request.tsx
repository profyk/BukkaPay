import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { RECENT_CONTACTS } from "@/lib/mockData";

export default function Request() {
  const [amount, setAmount] = useState("0");

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
        <h1 className="w-full text-center font-heading font-bold text-lg">Request Money</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-4 pb-8">
        
        {/* Contact Selection */}
        <div className="mb-8">
          <label className="text-sm font-medium text-muted-foreground mb-3 block">Recent Contacts</label>
          <div className="flex space-x-4 overflow-x-auto pb-2 no-scrollbar">
            <button className="flex flex-col items-center space-y-2 min-w-[60px]">
              <div className="w-14 h-14 rounded-full bg-secondary border border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground">
                 <User size={24} />
              </div>
              <span className="text-xs font-medium">New</span>
            </button>
            {RECENT_CONTACTS.map((contact) => (
              <button key={contact.id} className="flex flex-col items-center space-y-2 min-w-[60px]">
                <div className={`w-14 h-14 rounded-full ${contact.color} flex items-center justify-center text-lg font-bold`}>
                   {contact.initial}
                </div>
                <span className="text-xs font-medium">{contact.name}</span>
              </button>
            ))}
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

        <Button className="w-full h-14 text-lg rounded-xl shadow-lg shadow-primary/20 bg-violet-600 hover:bg-violet-700">
          Request Payment
        </Button>
      </div>
    </div>
  );
}
