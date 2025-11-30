import { Fuel, ShoppingCart, Bus, Coffee, ArrowUpRight, ArrowDownLeft, RefreshCw } from "lucide-react";

export const CARDS = [
  {
    id: "fuel",
    title: "Fuel",
    balance: 1250.50,
    currency: "$",
    icon: Fuel,
    color: "from-blue-600 to-blue-400",
    cardNumber: "**** 4582"
  },
  {
    id: "groceries",
    title: "Groceries",
    balance: 450.75,
    currency: "$",
    icon: ShoppingCart,
    color: "from-emerald-600 to-emerald-400",
    cardNumber: "**** 9921"
  },
  {
    id: "transport",
    title: "Transport",
    balance: 85.20,
    currency: "$",
    icon: Bus,
    color: "from-violet-600 to-violet-400",
    cardNumber: "**** 3310"
  },
  {
    id: "leisure",
    title: "Leisure",
    balance: 320.00,
    currency: "$",
    icon: Coffee,
    color: "from-orange-500 to-pink-500",
    cardNumber: "**** 1209"
  }
];

export const TRANSACTIONS = [
  {
    id: 1,
    title: "Shell Station",
    category: "Fuel",
    amount: -45.00,
    date: "Today, 10:23 AM",
    icon: Fuel,
    type: "expense"
  },
  {
    id: 2,
    title: "Sarah Jenkins",
    category: "Transfer",
    amount: 150.00,
    date: "Yesterday, 4:00 PM",
    icon: ArrowDownLeft,
    type: "income"
  },
  {
    id: 3,
    title: "Whole Foods",
    category: "Groceries",
    amount: -123.45,
    date: "Yesterday, 2:15 PM",
    icon: ShoppingCart,
    type: "expense"
  },
  {
    id: 4,
    title: "Uber Ride",
    category: "Transport",
    amount: -12.50,
    date: "Nov 28, 9:30 AM",
    icon: Bus,
    type: "expense"
  },
  {
    id: 5,
    title: "Cinema City",
    category: "Leisure",
    amount: -35.00,
    date: "Nov 27, 8:00 PM",
    icon: Coffee,
    type: "expense"
  }
];

export const RECENT_CONTACTS = [
  { id: 1, name: "Sarah", initial: "S", color: "bg-pink-100 text-pink-600" },
  { id: 2, name: "Mike", initial: "M", color: "bg-blue-100 text-blue-600" },
  { id: 3, name: "Mom", initial: "M", color: "bg-purple-100 text-purple-600" },
  { id: 4, name: "David", initial: "D", color: "bg-green-100 text-green-600" },
];
