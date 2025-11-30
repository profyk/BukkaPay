import { Send, ArrowDownLeft, QrCode, Plus } from "lucide-react";
import { Link } from "wouter";

export default function ActionButtons() {
  const actions = [
    { icon: Send, label: "Send", href: "/transfer", color: "bg-blue-500" },
    { icon: ArrowDownLeft, label: "Request", href: "/request", color: "bg-violet-500" },
    { icon: Plus, label: "Top Up", href: "/topup", color: "bg-emerald-500" },
    { icon: QrCode, label: "Scan", href: "/scan", color: "bg-orange-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
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
