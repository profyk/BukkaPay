import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CreditCard, Ticket, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function TopUp() {
  const [section, setSection] = useState<"select" | "card" | "voucher">("select");
  const [cardNumber, setCardNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [voucherCode, setVoucherCode] = useState("");

  const handleCardTopUp = async () => {
    if (!cardNumber || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      toast.success(`$${amount} added to your wallet!`);
      setCardNumber("");
      setAmount("");
      setSection("select");
    } catch (error) {
      toast.error("Failed to process card top-up");
    }
  };

  const handleVoucherTopUp = async () => {
    if (!voucherCode) {
      toast.error("Please enter a voucher code");
      return;
    }

    try {
      toast.success("Voucher redeemed successfully!");
      setVoucherCode("");
      setSection("select");
    } catch (error) {
      toast.error("Invalid or expired voucher");
    }
  };

  if (section === "select") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <Link href="/">
            <button
              className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft size={24} />
            </button>
          </Link>
          <h1 className="w-full text-center font-heading font-bold text-lg">
            Top Up Wallet
          </h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <p className="text-muted-foreground text-sm mb-6">
            Choose how you'd like to add funds to your wallet
          </p>

          <div className="space-y-4 flex-1">
            <motion.button
              onClick={() => setSection("card")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full p-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all"
              data-testid="button-section-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
                    <CreditCard size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-lg">Bank Card</p>
                    <p className="text-sm text-blue-100">
                      Top up with any bank card
                    </p>
                  </div>
                </div>
                <ChevronRight size={24} />
              </div>
            </motion.button>

            <motion.button
              onClick={() => setSection("voucher")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full p-6 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
              data-testid="button-section-voucher"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
                    <Ticket size={24} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-lg">Voucher</p>
                    <p className="text-sm text-emerald-100">
                      Redeem BukkaPay or other vouchers
                    </p>
                  </div>
                </div>
                <ChevronRight size={24} />
              </div>
            </motion.button>
          </div>

          <Link href="/">
            <Button
              variant="outline"
              className="w-full h-14 rounded-xl"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (section === "card") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setSection("select")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-card"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">
            Top Up with Card
          </h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 mb-8 text-white">
            <CreditCard size={32} className="mb-3" />
            <p className="text-blue-100 text-sm mb-2">Card Top Up</p>
            <p className="text-2xl font-bold">Fast & Secure</p>
          </div>

          <div className="space-y-6 flex-1">
            <div>
              <label className="block text-sm font-medium mb-2" data-testid="label-card-number">
                Card Number
              </label>
              <input
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16))}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-card-number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Expiry (MM/YY)</label>
                <input
                  type="text"
                  placeholder="12/25"
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-expiry"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">CVV</label>
                <input
                  type="text"
                  placeholder="123"
                  maxLength={3}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-cvv"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" data-testid="label-amount">
                Amount (USD)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold">$</span>
                <input
                  type="number"
                  placeholder="100.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="input-amount"
                />
              </div>
            </div>

            <div className="bg-secondary rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-2">Quick amounts</p>
              <div className="grid grid-cols-4 gap-2">
                {["25", "50", "100", "250"].map((val) => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className="py-2 rounded-lg text-sm font-medium bg-background hover:bg-primary/10 transition-colors"
                    data-testid={`button-amount-${val}`}
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleCardTopUp}
              className="w-full h-14 rounded-xl shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700"
              data-testid="button-confirm-card"
            >
              Top Up ${amount || "0.00"}
            </Button>
            <button
              onClick={() => setSection("select")}
              className="w-full h-14 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-medium"
              data-testid="button-back-topup"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <button
          onClick={() => setSection("select")}
          className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
          data-testid="button-back-voucher"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="w-full text-center font-heading font-bold text-lg">
          Redeem Voucher
        </h1>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-6 mb-8 text-white">
          <Ticket size={32} className="mb-3" />
          <p className="text-emerald-100 text-sm mb-2">Voucher Redemption</p>
          <p className="text-2xl font-bold">Instant Credit</p>
        </div>

        <div className="space-y-6 flex-1">
          <div>
            <label className="block text-sm font-medium mb-2" data-testid="label-voucher-code">
              Voucher Code
            </label>
            <input
              type="text"
              placeholder="Enter voucher code"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center text-lg font-mono tracking-widest"
              data-testid="input-voucher-code"
            />
          </div>

          <div className="bg-secondary rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-3">Supported Services</p>
            <div className="space-y-2">
              {[
                { name: "BukkaPay Gift Card", icon: "🎁" },
                { name: "iTunes & App Store", icon: "📱" },
                { name: "Google Play", icon: "🎮" },
                { name: "Amazon Gift Card", icon: "📦" },
              ].map((service, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background/50"
                  data-testid={`service-${idx}`}
                >
                  <span className="text-xl">{service.icon}</span>
                  <span className="text-sm font-medium">{service.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-xs font-medium text-blue-600 mb-1">💡 Tip</p>
            <p className="text-xs text-muted-foreground">
              Voucher codes typically start with "BKP-" or are 12-16 characters long. Make sure to enter the exact code.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleVoucherTopUp}
            className="w-full h-14 rounded-xl shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-redeem-voucher"
          >
            Redeem Voucher
          </Button>
          <button
            onClick={() => setSection("select")}
            className="w-full h-14 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-medium"
            data-testid="button-back-topup-voucher"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
