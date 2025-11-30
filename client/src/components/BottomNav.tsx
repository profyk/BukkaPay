import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Home, Wallet, Scan, ArrowRightLeft, User } from "lucide-react";

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const NavItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = location === href;
    return (
      <button
        onClick={() => setLocation(href)}
        className={cn(
          "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground hover:text-primary/70"
        )}
      >
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-black/90 backdrop-blur-lg border-t border-border z-50 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        <NavItem href="/" icon={Home} label="Home" />
        <NavItem href="/wallet" icon={Wallet} label="Cards" />
        <div className="relative -top-6">
          <button 
            onClick={() => setLocation("/scan")}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
          >
            <Scan size={24} />
          </button>
        </div>
        <NavItem href="/transfer" icon={ArrowRightLeft} label="Transfer" />
        <NavItem href="/profile" icon={User} label="Profile" />
      </div>
    </div>
  );
}
