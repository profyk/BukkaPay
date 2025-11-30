import { useLocation } from "wouter";
import { User, Shield, Bell, HelpCircle, LogOut, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { logout } from "@/lib/auth";

export default function Profile() {
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    logout();
    navigate?.("/login");
  };

  const menuItems = [
    { icon: User, label: "Personal Information" },
    { icon: Shield, label: "Security & Privacy" },
    { icon: Bell, label: "Notifications" },
    { icon: HelpCircle, label: "Help & Support" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="font-heading font-bold text-2xl">Profile</h1>
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
        
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-red-50 dark:hover:bg-red-950 text-red-600 transition-colors mt-8"
          data-testid="button-logout"
        >
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-600">
              <LogOut size={20} />
            </div>
            <span className="font-medium">Log Out</span>
          </div>
          <ChevronRight size={18} />
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
