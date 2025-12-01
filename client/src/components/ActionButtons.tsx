import { ArrowDownLeft, Plus, Smartphone, Users } from "lucide-react";
import { Link } from "wouter";

export default function ActionButtons() {
  const actions = [
    { icon: ArrowDownLeft, label: "Request", href: "/request", color: "bg-violet-500" },
    { icon: Smartphone, label: "Tap Pay", href: "/tap-pay", color: "bg-indigo-500" },
    { icon: Users, label: "Stokvel", href: "/stokvel", color: "bg-purple-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((action) => (
        <Link key={action.label} href={action.href}>
          <div className="flex flex-col items-center space-y-2 cursor-pointer group">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-105 ${action.color}`}>
              <action.icon size={24} />
            </div>
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              {action.label}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
