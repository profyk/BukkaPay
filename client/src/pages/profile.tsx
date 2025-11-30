import { Link } from "wouter";
import { ArrowLeft, User, Shield, Bell, HelpCircle, LogOut, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function Profile() {
  const menuItems = [
    { icon: User, label: "Personal Information" },
    { icon: Shield, label: "Security & Privacy" },
    { icon: Bell, label: "Notifications" },
    { icon: HelpCircle, label: "Help & Support" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative mb-6">
        <h1 className="w-full text-left font-heading font-bold text-2xl">Profile</h1>
      </header>

      <div className="px-6 flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold mb-4">
          AM
        </div>
        <h2 className="font-heading font-bold text-xl">Alex Morgan</h2>
        <p className="text-muted-foreground text-sm">alex.morgan@example.com</p>
      </div>

      <div className="px-6 space-y-2">
        {menuItems.map((item) => (
          <button key={item.label} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-secondary transition-colors group">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-secondary group-hover:bg-background flex items-center justify-center text-foreground transition-colors">
                <item.icon size={20} />
              </div>
              <span className="font-medium">{item.label}</span>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        ))}
        
        <button className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-red-50 text-red-600 transition-colors mt-8">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <LogOut size={20} />
              </div>
              <span className="font-medium">Log Out</span>
            </div>
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
