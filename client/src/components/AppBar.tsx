import { Bell, Search } from "lucide-react";
import { motion } from "framer-motion";
import logoUrl from "@assets/file_000000000540722fb204f238188c2387_1764495081777.png";

export default function AppBar() {
  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-1/2 transform -translate-x-1/2 w-full max-w-md z-50 px-6 py-4"
    >
      {/* Glassmorphic Background */}
      <div className="absolute inset-0 bg-white/70 dark:bg-card/70 backdrop-blur-2xl rounded-b-2xl border border-white/30 dark:border-white/10 shadow-lg" />
      
      {/* Content */}
      <div className="relative flex justify-between items-center">
        {/* Logo and BukkaPay Text */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          className="flex items-center space-x-3 cursor-pointer"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl opacity-20 blur-lg" />
            <img 
              src={logoUrl} 
              alt="BukkaPay Logo" 
              className="w-12 h-12 rounded-2xl object-contain relative z-10 shadow-lg"
            />
          </div>
          <div className="flex flex-col">
            <h2 className="font-heading font-bold text-xl bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
              BukkaPay
            </h2>
            <p className="text-xs text-muted-foreground font-medium">Smart Wallet</p>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200 backdrop-blur-sm"
            data-testid="button-search"
          >
            <Search size={20} />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-10 h-10 rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200 backdrop-blur-sm"
            data-testid="button-notifications"
          >
            <Bell size={20} />
            <motion.span 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background shadow-lg"
            />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}
