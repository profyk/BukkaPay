import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "@/lib/api";
import { mapCardFromAPI } from "@/lib/mappers";

export default function Transfer() {
  const [step, setStep] = useState<"select" | "amount" | "confirm" | "success">("select");
  const [amount, setAmount] = useState("0");
  const [fromCardId, setFromCardId] = useState("");
  const [toCardId, setToCardId] = useState("");
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);

  const { data: cards } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const mappedCards = cards?.map(mapCardFromAPI) || [];

  const fromCard = mappedCards.find((c) => c.id === fromCardId);
  const toCard = mappedCards.find((c) => c.id === toCardId);

  const handleNumberClick = (num: string) => {
    if (amount === "0" && num !== ".") {
      setAmount(num);
    } else {
      if (num === "." && amount.includes(".")) return;
      setAmount(amount + num);
    }
  };

  const handleBackspace = () => {
    if (amount.length === 1) {
      setAmount("0");
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  const handleProceed = () => {
    if (!fromCard || !toCard) {
      toast.error("Please select both cards");
      return;
    }
    if (fromCardId === toCardId) {
      toast.error("Select different cards");
      return;
    }
    setStep("amount");
  };

  const handleReview = () => {
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const fromBalance = parseFloat(fromCard?.balance || "0");
    if (transferAmount > fromBalance) {
      toast.error(`Insufficient balance. Available: $${fromBalance}`);
      return;
    }
    setStep("confirm");
  };

  const handleConfirm = async () => {
    const transferAmount = parseFloat(amount);

    try {
      // Simulate transfer
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Update local balances
      toast.success("Transfer completed successfully!");
      setStep("success");

      // Reset after 3 seconds
      setTimeout(() => {
        setStep("select");
        setAmount("0");
        setFromCardId("");
        setToCardId("");
      }, 3000);
    } catch (error) {
      toast.error("Transfer failed");
    }
  };

  if (step === "select") {
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
          <h1 className="w-full text-center font-heading font-bold text-lg">Transfer Money</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <p className="text-muted-foreground text-sm mb-6">Choose cards to transfer between</p>

          <div className="space-y-4 flex-1">
            {/* From Card Selection */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">FROM</p>
              <div className="relative">
                <button
                  onClick={() => {
                    setShowFromDropdown(!showFromDropdown);
                    setShowToDropdown(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary border-2 border-border hover:border-primary transition-colors"
                  data-testid="button-from-card"
                >
                  {fromCard ? (
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${fromCard.color} flex items-center justify-center text-white`}
                      >
                        📱
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">{fromCard.title}</p>
                        <p className="text-xs text-muted-foreground">${fromCard.balance}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select card...</span>
                  )}
                  <ChevronDown size={20} />
                </button>

                {showFromDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full mt-2 w-full bg-secondary rounded-lg border border-border shadow-lg z-50"
                    data-testid="dropdown-from"
                  >
                    {mappedCards.map((card, idx) => (
                      <button
                        key={card.id}
                        onClick={() => {
                          setFromCardId(card.id);
                          setShowFromDropdown(false);
                        }}
                        className={`w-full text-left p-4 flex items-center gap-3 hover:bg-background/50 transition-colors ${
                          idx !== mappedCards.length - 1 ? "border-b border-border" : ""
                        }`}
                        data-testid={`option-from-${idx}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${card.color} flex items-center justify-center text-white text-sm`}
                        >
                          📱
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{card.title}</p>
                          <p className="text-xs text-muted-foreground">${card.balance}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <ArrowRight size={18} className="text-primary rotate-90" />
              </div>
            </div>

            {/* To Card Selection */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">TO</p>
              <div className="relative">
                <button
                  onClick={() => {
                    setShowToDropdown(!showToDropdown);
                    setShowFromDropdown(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary border-2 border-border hover:border-primary transition-colors"
                  data-testid="button-to-card"
                >
                  {toCard ? (
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${toCard.color} flex items-center justify-center text-white`}
                      >
                        📱
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">{toCard.title}</p>
                        <p className="text-xs text-muted-foreground">${toCard.balance}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select card...</span>
                  )}
                  <ChevronDown size={20} />
                </button>

                {showToDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full mt-2 w-full bg-secondary rounded-lg border border-border shadow-lg z-50"
                    data-testid="dropdown-to"
                  >
                    {mappedCards.map((card, idx) => (
                      <button
                        key={card.id}
                        onClick={() => {
                          setToCardId(card.id);
                          setShowToDropdown(false);
                        }}
                        className={`w-full text-left p-4 flex items-center gap-3 hover:bg-background/50 transition-colors ${
                          idx !== mappedCards.length - 1 ? "border-b border-border" : ""
                        }`}
                        data-testid={`option-to-${idx}`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${card.color} flex items-center justify-center text-white text-sm`}
                        >
                          📱
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{card.title}</p>
                          <p className="text-xs text-muted-foreground">${card.balance}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={handleProceed}
            disabled={!fromCard || !toCard || fromCardId === toCardId}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 disabled:opacity-50"
            data-testid="button-proceed"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (step === "amount") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setStep("select")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-amount"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Transfer Amount</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-4 pb-8">
          {/* Card Preview */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary mb-6" data-testid="transfer-preview">
            <div className="flex items-center gap-2">
              <div className="text-sm">{fromCard?.title}</div>
              <ArrowRight size={16} className="text-primary" />
              <div className="text-sm">{toCard?.title}</div>
            </div>
          </div>

          {/* Amount Display */}
          <div className="flex-1 flex items-center justify-center mb-8">
            <div className="text-center">
              <span className="text-4xl font-bold text-muted-foreground mr-1">$</span>
              <span className="text-6xl font-bold font-heading tracking-tighter">{amount}</span>
            </div>
          </div>

          {/* Quick Amount Buttons */}
          <div className="bg-secondary rounded-lg p-4 mb-6">
            <p className="text-xs text-muted-foreground mb-3 font-medium">QUICK AMOUNTS</p>
            <div className="grid grid-cols-4 gap-2">
              {["25", "50", "100", "250"].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className="py-2 px-2 rounded-lg text-sm font-semibold bg-background hover:bg-primary/20 transition-colors"
                  data-testid={`button-quick-${val}`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0].map((num) => (
              <motion.button
                key={num}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleNumberClick(num.toString())}
                className="h-14 rounded-lg text-2xl font-semibold bg-secondary hover:bg-secondary/80 transition-colors"
                data-testid={`button-num-${num}`}
              >
                {num}
              </motion.button>
            ))}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleBackspace}
              className="h-14 rounded-lg flex items-center justify-center bg-secondary hover:bg-secondary/80 transition-colors col-span-3"
              data-testid="button-backspace"
            >
              ← Delete
            </motion.button>
          </div>

          <Button
            onClick={handleReview}
            className="w-full h-12 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600"
            data-testid="button-review"
          >
            Review Transfer
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setStep("amount")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-confirm"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Confirm Transfer</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-secondary rounded-2xl p-6 mb-8"
            data-testid="confirm-card"
          >
            <p className="text-muted-foreground text-sm mb-4">Transfer Summary</p>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <p className="text-lg font-semibold">{fromCard?.title}</p>
              </div>

              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <ArrowRight size={20} className="text-primary rotate-90" />
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <p className="text-lg font-semibold">{toCard?.title}</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground mb-1">Amount</p>
                <p className="text-3xl font-bold">${amount}</p>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-600">
                ⚠️ This transfer will be completed immediately. Both cards will be updated.
              </p>
            </div>
          </motion.div>

          <div className="flex-1" />

          <div className="space-y-3">
            <Button
              onClick={handleConfirm}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600"
              data-testid="button-confirm-transfer"
            >
              Complete Transfer
            </Button>
            <Button
              onClick={() => setStep("amount")}
              variant="outline"
              className="w-full h-12 rounded-lg"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} className="text-white" />
          </div>
        </motion.div>

        <h1 className="text-3xl font-bold mb-2">Transfer Complete!</h1>
        <p className="text-muted-foreground mb-2">Your money has been transferred</p>

        <div className="bg-secondary rounded-2xl p-6 w-full my-8">
          <p className="text-muted-foreground text-sm mb-2">Amount Transferred</p>
          <p className="text-4xl font-bold mb-6">${amount}</p>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">From</p>
              <p className="font-medium">{fromCard?.title}</p>
            </div>
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">To</p>
              <p className="font-medium">{toCard?.title}</p>
            </div>
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">Reference</p>
              <p className="font-mono text-sm">TRF-{Date.now().toString().slice(-8)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-3">
        <Link href="/">
          <Button
            className="w-full h-12 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600"
            data-testid="button-home"
          >
            Back to Home
          </Button>
        </Link>
        <button
          onClick={() => {
            setStep("select");
            setAmount("0");
            setFromCardId("");
            setToCardId("");
          }}
          className="w-full h-12 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors font-medium"
          data-testid="button-new-transfer"
        >
          Make Another Transfer
        </button>
      </div>
    </div>
  );
}
