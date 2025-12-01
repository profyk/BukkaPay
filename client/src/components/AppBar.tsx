import { Bell, Search, MoreVertical } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLocation } from "wouter";
import { logout } from "@/lib/auth";
import appIcon from "../assets/bukkapay-icon.png";

export default function AppBar() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate?.("/login");
  };

  const menuItems = [
    { label: "Marketplace", action: () => navigate?.("/buy") },
    { label: "Explore Features", action: () => navigate?.("/features") },
    { label: "Support Chat", action: () => navigate?.("/support-chat") },
    { label: "Settings", action: () => navigate?.("/profile") },
    { label: "My Wallet ID", action: () => navigate?.("/my-id") },
    { label: "Logout", action: handleLogout },
  ];

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
            <img 
              src={appIcon} 
              alt="BukkaPay" 
              className="w-12 h-12 rounded-lg object-contain relative z-10 shadow-lg"
            />
          </div>
          <div className="flex flex-col">
            <h2 className="font-heading font-bold text-xl text-foreground">
              BukkaPay
            </h2>
            <p className="text-xs text-muted-foreground font-medium">Smart Wallet</p>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 relative">
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate?.("/search")}
            className="w-10 h-10 rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200 backdrop-blur-sm"
            data-testid="button-search"
          >
            <Search size={20} />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate?.("/notifications")}
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

          {/* Menu Button */}
          <div className="relative">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-10 h-10 rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200 backdrop-blur-sm"
              data-testid="button-menu"
            >
              <MoreVertical size={20} />
            </motion.button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-0 mt-2 w-48 bg-white dark:bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50"
                data-testid="menu-dropdown"
              >
                {menuItems.map((item, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => {
                      item.action();
                      setMenuOpen(false);
                    }}
                    whileHover={{ backgroundColor: "rgba(139, 92, 246, 0.1)" }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-secondary transition-colors border-b border-border/50 last:border-b-0"
                    data-testid={`menu-item-${idx}`}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
          data-testid="menu-overlay"
        />
      )}
    </motion.header>
  );
}
