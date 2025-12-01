import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, CheckCircle2, AlertCircle, Info, Trash2, Download } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

interface Notification {
  id: string;
  type: "success" | "info" | "warning" | "alert";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  icon?: React.ReactNode;
}

export default function Notifications() {
  const [, navigate] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "success",
      title: "Payment Received",
      message: "You received $50 from John Doe",
      timestamp: "2 hours ago",
      read: false,
    },
    {
      id: "2",
      type: "success",
      title: "Transfer Completed",
      message: "You sent $100 to Alice Smith",
      timestamp: "5 hours ago",
      read: false,
    },
    {
      id: "3",
      type: "info",
      title: "Card Added",
      message: "Your new debit card has been added successfully",
      timestamp: "1 day ago",
      read: true,
    },
    {
      id: "4",
      type: "warning",
      title: "Low Balance Alert",
      message: "Your wallet balance is below $100",
      timestamp: "2 days ago",
      read: true,
    },
    {
      id: "5",
      type: "success",
      title: "Loyalty Points Earned",
      message: "You earned 250 points from your transaction",
      timestamp: "3 days ago",
      read: true,
    },
    {
      id: "6",
      type: "info",
      title: "New Feature Available",
      message: "Check out our new Stokvel group savings feature",
      timestamp: "1 week ago",
      read: true,
    },
    {
      id: "7",
      type: "alert",
      title: "Security Alert",
      message: "New login from Chrome on Windows",
      timestamp: "2 weeks ago",
      read: true,
    },
    {
      id: "8",
      type: "success",
      title: "Referral Bonus",
      message: "Your friend signed up! You earned ₦500",
      timestamp: "3 weeks ago",
      read: true,
    },
  ]);

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={24} className="text-emerald-600" />;
      case "warning":
        return <AlertCircle size={24} className="text-amber-600" />;
      case "alert":
        return <AlertCircle size={24} className="text-red-600" />;
      default:
        return <Info size={24} className="text-blue-600" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-emerald-500/10 border-emerald-500/30";
      case "warning":
        return "bg-amber-500/10 border-amber-500/30";
      case "alert":
        return "bg-red-500/10 border-red-500/30";
      default:
        return "bg-blue-500/10 border-blue-500/30";
    }
  };

  const handleDelete = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id));
    toast.success("Notification deleted");
  };

  const handleMarkAsRead = (id: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleClearAll = () => {
    setNotifications([]);
    toast.success("All notifications cleared");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleGetSlip = () => {
    navigate?.("/transaction-slip");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <button
          onClick={() => navigate?.("/")}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading font-bold text-lg">Notifications</h1>
        {notifications.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-sm text-primary hover:text-primary/80 font-medium"
            data-testid="button-clear-all"
          >
            Clear All
          </button>
        )}
        {notifications.length === 0 && <div className="w-10" />}
      </header>

      <div className="px-6 space-y-4">
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2"
            data-testid="unread-badge"
          >
            <Bell size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-600">
              {unreadCount} new notification{unreadCount !== 1 ? "s" : ""}
            </span>
          </motion.div>
        )}

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification, idx) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => handleMarkAsRead(notification.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  getBgColor(notification.type)
                } ${!notification.read ? "ring-2 ring-primary/30" : ""}`}
                data-testid={`notification-${idx}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-1">
                          {notification.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {notification.timestamp}
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate?.("/transaction-slip");
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                        data-testid={`button-get-slip-${idx}`}
                      >
                        <Download size={14} />
                        Get Slip
                      </motion.button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notification.id);
                        }}
                        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                        data-testid={`button-delete-${idx}`}
                      >
                        <Trash2 size={16} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-16 text-center"
            data-testid="empty-state"
          >
            <div className="bg-secondary rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Bell size={32} className="text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold mb-2">No Notifications</p>
            <p className="text-sm text-muted-foreground">
              You're all caught up! Check back later for updates.
            </p>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
