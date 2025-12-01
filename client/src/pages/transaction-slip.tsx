import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, Share2, Mail, MessageCircle, Copy, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

interface Transaction {
  id: string;
  type: "sent" | "received" | "purchase" | "topup";
  amount: string;
  currency: string;
  recipient: string;
  recipientId?: string;
  description: string;
  date: string;
  time: string;
  status: "completed" | "pending" | "failed";
  reference: string;
}

export default function TransactionSlip() {
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);

  // Mock transaction - in real app, fetch from params or state
  const transaction: Transaction = {
    id: "TXN-2024-001",
    type: "sent",
    amount: "2,500",
    currency: "₦",
    recipient: "John Doe",
    recipientId: "BKP-J0HND0E",
    description: "Payment for services",
    date: "December 1, 2024",
    time: "2:45 PM",
    status: "completed",
    reference: "REF-20241201-001",
  };

  const downloadSlip = () => {
    toast.success("Slip downloaded successfully!");
    // In real app, generate PDF here
  };

  const shareViaEmail = () => {
    const mailtoLink = `mailto:?subject=Transaction Receipt - ${transaction.reference}&body=Transaction Receipt%0A%0AAmount: ${transaction.currency}${transaction.amount}%0ARecipient: ${transaction.recipient}%0ADate: ${transaction.date}%0AReference: ${transaction.reference}`;
    window.location.href = mailtoLink;
  };

  const shareViaWhatsApp = () => {
    const message = `Transaction Receipt\n\nAmount: ${transaction.currency}${transaction.amount}\nRecipient: ${transaction.recipient}\nDate: ${transaction.date}\nTime: ${transaction.time}\nReference: ${transaction.reference}\n\nStatus: Completed`;
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, "_blank");
  };

  const copyToClipboard = () => {
    const slipText = `Transaction Receipt\nAmount: ${transaction.currency}${transaction.amount}\nRecipient: ${transaction.recipient}\nDate: ${transaction.date}\nTime: ${transaction.time}\nReference: ${transaction.reference}\nStatus: Completed`;
    navigator.clipboard.writeText(slipText);
    setCopied(true);
    toast.success("Slip copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <button
          onClick={() => navigate?.("/notifications")}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-heading font-bold text-lg">Transaction Receipt</h1>
        <div className="w-10" />
      </header>

      <div className="px-6 space-y-6">
        {/* Receipt Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-white"
          data-testid="receipt-card"
        >
          {/* Status Badge */}
          <div className="flex items-center justify-center mb-6">
            <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-full p-3">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
          </div>

          {/* Amount Section */}
          <div className="text-center mb-8">
            <p className="text-sm text-slate-400 mb-2">Amount Transferred</p>
            <h2 className="text-5xl font-bold mb-1">{transaction.currency}{transaction.amount}</h2>
            <p className="text-sm text-emerald-400 font-medium">✓ Completed</p>
          </div>

          {/* Transaction Details */}
          <div className="space-y-4 border-t border-white/10 pt-6 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Transaction Type</span>
              <span className="font-medium capitalize">{transaction.type}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Recipient</span>
              <span className="font-medium">{transaction.recipient}</span>
            </div>
            {transaction.recipientId && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Recipient ID</span>
                <span className="font-mono text-xs">{transaction.recipientId}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Description</span>
              <span className="font-medium text-right">{transaction.description}</span>
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-2 border-t border-white/10 pt-6 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Date</span>
              <span className="font-medium">{transaction.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Time</span>
              <span className="font-medium">{transaction.time}</span>
            </div>
          </div>

          {/* Reference */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="text-xs text-slate-400 mb-2">Reference Number</p>
            <div className="flex items-center justify-between">
              <code className="font-mono text-sm font-bold">{transaction.reference}</code>
              <button
                onClick={copyToClipboard}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                data-testid="button-copy-ref"
              >
                <Copy size={16} className={copied ? "text-emerald-400" : "text-slate-400"} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Share Receipt</h3>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={downloadSlip}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20"
            data-testid="button-download-slip"
          >
            <Download size={20} />
            Download Receipt
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={shareViaEmail}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-medium transition-all hover:shadow-lg hover:shadow-purple-500/20"
            data-testid="button-share-email"
          >
            <Mail size={20} />
            Share via Email
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={shareViaWhatsApp}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/20"
            data-testid="button-share-whatsapp"
          >
            <MessageCircle size={20} />
            Share via WhatsApp
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={copyToClipboard}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-medium transition-all"
            data-testid="button-copy-slip"
          >
            <Copy size={20} />
            Copy Receipt
          </motion.button>
        </div>

        {/* Info Section */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-xs text-blue-600/80">
            💡 This receipt can be used as proof of transaction. Keep it safe for your records.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
