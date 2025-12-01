import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Smartphone,
  Zap,
  Wifi,
  Tv,
  Pill,
  MapPin,
  ShoppingCart,
  Search,
  Star,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  provider: string;
  price: number;
  value: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  rating: number;
  discount?: number;
}

const products: Product[] = [
  // Airtime
  {
    id: "airtime-mtn-500",
    name: "MTN Airtime",
    provider: "MTN Nigeria",
    price: 500,
    value: "₦500",
    description: "500 units of credit",
    icon: <Smartphone size={24} />,
    category: "airtime",
    rating: 4.8,
  },
  {
    id: "airtime-glo-1000",
    name: "Glo Airtime",
    provider: "Globacom",
    price: 1000,
    value: "₦1,000",
    description: "1000 units of credit",
    icon: <Smartphone size={24} />,
    category: "airtime",
    rating: 4.7,
  },
  {
    id: "airtime-9mobile-2000",
    name: "9mobile Airtime",
    provider: "9Mobile",
    price: 2000,
    value: "₦2,000",
    description: "2000 units of credit",
    icon: <Smartphone size={24} />,
    category: "airtime",
    rating: 4.6,
    discount: 5,
  },
  {
    id: "airtime-airtel-5000",
    name: "Airtel Airtime",
    provider: "Airtel Africa",
    price: 5000,
    value: "₦5,000",
    description: "5000 units of credit",
    icon: <Smartphone size={24} />,
    category: "airtime",
    rating: 4.9,
  },

  // Data
  {
    id: "data-mtn-1gb",
    name: "1GB Daily Plan",
    provider: "MTN Nigeria",
    price: 100,
    value: "1GB/24hrs",
    description: "Valid for 24 hours",
    icon: <Wifi size={24} />,
    category: "data",
    rating: 4.7,
  },
  {
    id: "data-glo-2gb",
    name: "2GB Weekly Plan",
    provider: "Globacom",
    price: 200,
    value: "2GB/7days",
    description: "Valid for 7 days",
    icon: <Wifi size={24} />,
    category: "data",
    rating: 4.6,
  },
  {
    id: "data-airtel-5gb",
    name: "5GB Monthly Plan",
    provider: "Airtel Africa",
    price: 500,
    value: "5GB/30days",
    description: "Valid for 30 days",
    icon: <Wifi size={24} />,
    category: "data",
    rating: 4.8,
  },
  {
    id: "data-9mobile-10gb",
    name: "10GB Monthly Plan",
    provider: "9Mobile",
    price: 1000,
    value: "10GB/30days",
    description: "Valid for 30 days",
    icon: <Wifi size={24} />,
    category: "data",
    rating: 4.5,
    discount: 10,
  },

  // Electricity
  {
    id: "electricity-kedco",
    name: "KEDCO Prepaid",
    provider: "Kano Electricity",
    price: 2000,
    value: "₦2,000",
    description: "Prepaid electricity tokens",
    icon: <Zap size={24} />,
    category: "electricity",
    rating: 4.6,
  },
  {
    id: "electricity-eedc",
    name: "EEDC Prepaid",
    provider: "Enugu Electricity",
    price: 5000,
    value: "₦5,000",
    description: "Prepaid electricity tokens",
    icon: <Zap size={24} />,
    category: "electricity",
    rating: 4.7,
  },
  {
    id: "electricity-ikedc",
    name: "IKEDC Prepaid",
    provider: "Ikeja Electricity",
    price: 10000,
    value: "₦10,000",
    description: "Prepaid electricity tokens",
    icon: <Zap size={24} />,
    category: "electricity",
    rating: 4.8,
  },

  // Bills
  {
    id: "bills-dstv",
    name: "DSTV Subscription",
    provider: "MultiChoice",
    price: 3500,
    value: "Monthly Plan",
    description: "Access 150+ channels",
    icon: <Tv size={24} />,
    category: "bills",
    rating: 4.9,
  },
  {
    id: "bills-gotv",
    name: "GOTV Subscription",
    provider: "MultiChoice",
    price: 1500,
    value: "Monthly Plan",
    description: "Entertainment packages",
    icon: <Tv size={24} />,
    category: "bills",
    rating: 4.7,
  },

  // Insurance & Health
  {
    id: "insurance-health",
    name: "Health Insurance",
    provider: "BukkaCare",
    price: 5000,
    value: "Monthly Premium",
    description: "Family health coverage",
    icon: <Pill size={24} />,
    category: "insurance",
    rating: 4.8,
  },
  {
    id: "insurance-travel",
    name: "Travel Insurance",
    provider: "BukkaCare",
    price: 3000,
    value: "Per Trip",
    description: "Full coverage while traveling",
    icon: <MapPin size={24} />,
    category: "insurance",
    rating: 4.6,
  },
];

const categories = [
  { id: "all", label: "All", icon: ShoppingCart },
  { id: "airtime", label: "Airtime", icon: Smartphone },
  { id: "data", label: "Data", icon: Wifi },
  { id: "electricity", label: "Electricity", icon: Zap },
  { id: "bills", label: "Bills", icon: Tv },
  { id: "insurance", label: "Insurance", icon: Pill },
];

export default function Buy() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [sortBy, setSortBy] = useState<"price-low" | "price-high" | "rating">("rating");

  const filteredProducts = products
    .filter(
      (p) =>
        (activeCategory === "all" || p.category === activeCategory) &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.provider.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "price-high") return b.price - a.price;
      return b.rating - a.rating;
    });

  const addToCart = (product: Product) => {
    setCart([...cart, product]);
    toast.success(`${product.name} added to cart!`);
  };

  const handleQuickBuy = (product: Product) => {
    toast.success(`Purchasing ${product.name}...`);
    // Simulate purchase
    setTimeout(() => {
      toast.success("Purchase completed!");
    }, 1500);
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="px-6 pt-12 pb-6 flex items-center relative">
        <Link href="/">
          <button
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">
          BukkaPay Market
        </h1>
      </header>

      {/* Search Bar */}
      <div className="px-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-muted-foreground" size={20} />
          <input
            type="text"
            placeholder="Search airtime, data, bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="input-search"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-6 mb-6 overflow-x-auto flex gap-2">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <motion.button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap font-medium transition-all ${
                activeCategory === cat.id
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
              data-testid={`button-category-${cat.id}`}
            >
              <Icon size={16} />
              {cat.label}
            </motion.button>
          );
        })}
      </div>

      {/* Sort Options */}
      <div className="px-6 mb-4 flex gap-2">
        {(["rating", "price-low", "price-high"] as const).map((sort) => (
          <button
            key={sort}
            onClick={() => setSortBy(sort)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              sortBy === sort
                ? "bg-primary text-white"
                : "bg-secondary text-muted-foreground"
            }`}
            data-testid={`button-sort-${sort}`}
          >
            {sort === "rating"
              ? "⭐ Top Rated"
              : sort === "price-low"
              ? "💰 Low to High"
              : "💰 High to Low"}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="px-6 flex-1">
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredProducts.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white hover:shadow-lg hover:shadow-primary/20 transition-all"
                data-testid={`product-card-${idx}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-white/10">
                      {product.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="text-xs text-slate-300">{product.provider}</p>
                    </div>
                  </div>
                  {product.discount && (
                    <div className="bg-emerald-500 px-2 py-1 rounded text-xs font-bold">
                      -{product.discount}%
                    </div>
                  )}
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold">{product.value}</p>
                    <p className="text-xs text-slate-400">
                      {product.description}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      <Star size={14} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-xs text-slate-300">{product.rating}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => addToCart(product)}
                      className="p-2 rounded-lg bg-primary/20 hover:bg-primary/40 transition-colors"
                      data-testid={`button-add-cart-${idx}`}
                    >
                      <ShoppingCart size={18} />
                    </button>
                    <button
                      onClick={() => handleQuickBuy(product)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:shadow-lg hover:shadow-violet-500/20 transition-all font-medium text-sm"
                      data-testid={`button-buy-${idx}`}
                    >
                      Buy
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart size={48} className="text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>

      {/* Cart Summary */}
      {cart.length > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md px-6 py-4 bg-gradient-to-t from-background to-background/80 border-t border-border backdrop-blur-md"
          data-testid="cart-summary"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground">Cart Items</p>
              <p className="text-2xl font-bold">₦{totalPrice.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{cart.length} items</p>
              <button
                onClick={() => setCart([])}
                className="text-xs text-red-500 hover:text-red-600"
                data-testid="button-clear-cart"
              >
                Clear
              </button>
            </div>
          </div>

          <Button
            onClick={() => {
              toast.success("Proceeding to checkout...");
              setCart([]);
            }}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:shadow-lg hover:shadow-violet-500/20"
            data-testid="button-checkout"
          >
            Checkout
            <ChevronRight size={18} className="ml-2" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
