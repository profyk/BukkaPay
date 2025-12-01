import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search as SearchIcon, Wallet, CreditCard, Users, FileText, Zap } from "lucide-react";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";

interface SearchResult {
  id: string;
  type: "transaction" | "card" | "contact" | "feature" | "page";
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

export default function Search() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");

  const allItems: SearchResult[] = [
    // Transactions
    {
      id: "tx-1",
      type: "transaction",
      title: "Payment to John Doe",
      description: "$50 sent • 2 hours ago",
      icon: <CreditCard size={20} className="text-blue-600" />,
      action: () => navigate?.("/"),
    },
    {
      id: "tx-2",
      type: "transaction",
      title: "Received from Alice Smith",
      description: "$100 received • 5 hours ago",
      icon: <CreditCard size={20} className="text-emerald-600" />,
      action: () => navigate?.("/"),
    },
    // Cards
    {
      id: "card-1",
      type: "card",
      title: "Main Visa Card",
      description: "****4242 • $2,456.50 balance",
      icon: <Wallet size={20} className="text-purple-600" />,
      action: () => navigate?.("/wallet"),
    },
    {
      id: "card-2",
      type: "card",
      title: "Savings Card",
      description: "****8765 • $5,200.00 balance",
      icon: <Wallet size={20} className="text-blue-600" />,
      action: () => navigate?.("/wallet"),
    },
    // Contacts
    {
      id: "contact-1",
      type: "contact",
      title: "Alice Smith",
      description: "alice.smith@email.com • Frequent",
      icon: <Users size={20} className="text-pink-600" />,
      action: () => navigate?.("/scan-pay"),
    },
    {
      id: "contact-2",
      type: "contact",
      title: "John Doe",
      description: "john.doe@email.com • 5 transfers",
      icon: <Users size={20} className="text-orange-600" />,
      action: () => navigate?.("/scan-pay"),
    },
    // Features
    {
      id: "feature-1",
      type: "feature",
      title: "Send Money",
      description: "Send funds to BukkaPay, mobile wallet, or bank",
      icon: <Zap size={20} className="text-cyan-600" />,
      action: () => navigate?.("/scan-pay"),
    },
    {
      id: "feature-2",
      type: "feature",
      title: "QR Code Scan",
      description: "Scan & pay using QR codes",
      icon: <Zap size={20} className="text-indigo-600" />,
      action: () => navigate?.("/qr-pay"),
    },
    {
      id: "feature-3",
      type: "feature",
      title: "Tap to Pay",
      description: "Make payments with tap functionality",
      icon: <Zap size={20} className="text-blue-600" />,
      action: () => navigate?.("/tap-pay"),
    },
    {
      id: "feature-4",
      type: "feature",
      title: "Top Up",
      description: "Add funds to your wallet",
      icon: <Zap size={20} className="text-green-600" />,
      action: () => navigate?.("/topup"),
    },
    {
      id: "feature-5",
      type: "feature",
      title: "Marketplace",
      description: "Buy airtime, data, and services",
      icon: <Zap size={20} className="text-amber-600" />,
      action: () => navigate?.("/buy"),
    },
    {
      id: "feature-6",
      type: "feature",
      title: "Stokvel",
      description: "Group savings for families and communities",
      icon: <Zap size={20} className="text-purple-600" />,
      action: () => navigate?.("/stokvel"),
    },
    {
      id: "feature-7",
      type: "feature",
      title: "Loyalty Rewards",
      description: "Earn points and get exclusive rewards",
      icon: <Zap size={20} className="text-pink-600" />,
      action: () => navigate?.("/loyalty"),
    },
    {
      id: "feature-8",
      type: "feature",
      title: "Spending Analytics",
      description: "Track your spending and budgets",
      icon: <Zap size={20} className="text-teal-600" />,
      action: () => navigate?.("/analytics"),
    },
    // Pages
    {
      id: "page-1",
      type: "page",
      title: "Wallet",
      description: "Manage your cards and accounts",
      icon: <FileText size={20} className="text-slate-600" />,
      action: () => navigate?.("/wallet"),
    },
    {
      id: "page-2",
      type: "page",
      title: "Transfer",
      description: "Card-to-card transfers",
      icon: <FileText size={20} className="text-slate-600" />,
      action: () => navigate?.("/transfer"),
    },
    {
      id: "page-3",
      type: "page",
      title: "Request Payment",
      description: "Request money from others",
      icon: <FileText size={20} className="text-slate-600" />,
      action: () => navigate?.("/request"),
    },
  ];

  const filteredResults = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery)
    );
  }, [query]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "transaction":
        return "Transaction";
      case "card":
        return "Card";
      case "contact":
        return "Contact";
      case "feature":
        return "Feature";
      case "page":
        return "Page";
      default:
        return type;
    }
  };

  const groupedResults = useMemo(() => {
    const grouped: { [key: string]: SearchResult[] } = {};
    filteredResults.forEach((result) => {
      if (!grouped[result.type]) {
        grouped[result.type] = [];
      }
      grouped[result.type].push(result);
    });
    return grouped;
  }, [filteredResults]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-8 pb-6 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate?.("/")}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="font-heading font-bold text-lg">Search</h1>
        </div>

        <div className="relative">
          <SearchIcon size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search transactions, cards, features..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="input-search"
          />
        </div>
      </header>

      <div className="px-6 space-y-6">
        {query.trim() === "" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-12 text-center"
            data-testid="empty-search"
          >
            <div className="bg-secondary rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <SearchIcon size={32} className="text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold mb-2">Start Searching</p>
            <p className="text-sm text-muted-foreground">
              Search for transactions, cards, contacts, and features
            </p>
          </motion.div>
        ) : filteredResults.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-12 text-center"
            data-testid="no-results"
          >
            <p className="text-lg font-semibold mb-2">No Results Found</p>
            <p className="text-sm text-muted-foreground">
              Try searching with different keywords
            </p>
          </motion.div>
        ) : (
          Object.entries(groupedResults).map(([type, results]) => (
            <div key={type}>
              <h2 className="text-xs font-bold text-muted-foreground mb-3 uppercase">
                {getTypeLabel(type)}
              </h2>
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <motion.button
                    key={result.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={result.action}
                    className="w-full p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-left border border-border hover:border-primary"
                    data-testid={`search-result-${result.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">{result.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{result.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {result.description}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
