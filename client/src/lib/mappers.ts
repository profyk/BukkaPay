import { Fuel, ShoppingCart, Bus, Coffee, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";

const iconMap: Record<string, any> = {
  "fuel": Fuel,
  "shopping-cart": ShoppingCart,
  "bus": Bus,
  "coffee": Coffee,
  "arrow-up-right": ArrowUpRight,
  "arrow-down-left": ArrowDownLeft,
  "arrow-right-left": RefreshCw,
};

const colorMap: Record<string, string> = {
  "blue": "from-blue-600 to-blue-400",
  "green": "from-emerald-600 to-emerald-400",
  "purple": "from-violet-600 to-violet-400",
  "orange": "from-orange-500 to-pink-500",
};

export function mapCardFromAPI(card: any) {
  return {
    ...card,
    balance: parseFloat(card.balance),
    icon: iconMap[card.icon] || Fuel,
    color: colorMap[card.color] || "from-blue-600 to-blue-400",
  };
}

export function mapTransactionFromAPI(tx: any) {
  return {
    ...tx,
    amount: parseFloat(tx.amount),
    date: new Date(tx.createdAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    icon: iconMap[tx.icon] || ArrowDownLeft,
  };
}
