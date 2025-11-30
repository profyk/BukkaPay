import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Share2, MessageCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth";

export default function Request() {
  const [amount, setAmount] = useState("0");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [step, setStep] = useState<"input" | "confirm" | "share">("input");
  const [requestId, setRequestId] = useState("");
  const [copied, setCopied] = useState(false);

  const user = getCurrentUser();

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

  const handleConfirm = async () => {
    if (parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!recipientName.trim()) {
      toast.error("Please enter recipient name");
      return;
    }
    setStep("confirm");
  };

  const handleCreateRequest = async () => {
    try {
      const response = await fetch("/api/payment-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({
          amount,
          currency: "USD",
          recipientName,
          recipientPhone,
        }),
      });

      if (!response.ok) throw new Error("Failed to create request");

      const request = await response.json();
      setRequestId(request.id);
      setStep("share");
      toast.success("Payment request created!");
    } catch (error) {
      toast.error("Error creating payment request");
    }
  };

  const requestLink = `${window.location.origin}/pay/${requestId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(requestLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied to clipboard!");
  };

  const handleShareWhatsApp = () => {
    const message = `I'm requesting $${amount} payment from you via BukkaPay. Click here to pay: ${requestLink}`;
    const whatsappUrl = `https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  if (step === "input") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <Link href="/">
            <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
              <ArrowLeft size={24} />
            </button>
          </Link>
          <h1 className="w-full text-center font-heading font-bold text-lg">Request Money</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-4 pb-8">
          {/* Recipient Input */}
          <div className="mb-6">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Recipient Name</label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Enter name or contact"
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-violet-500"
              data-testid="input-recipient-name"
            />
          </div>

          <div className="mb-8">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Phone Number (Optional)</label>
            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-violet-500"
              data-testid="input-recipient-phone"
            />
          </div>

          {/* Amount Display */}
          <div className="flex-1 flex items-center justify-center mb-8">
            <div className="text-center">
              <span className="text-4xl font-bold text-muted-foreground mr-1">$</span>
              <span className="text-6xl font-bold font-heading tracking-tighter">{amount}</span>
            </div>
          </div>

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0].map((num) => (
              <motion.button
                key={num}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleNumberClick(num.toString())}
                className="h-16 rounded-xl text-2xl font-medium hover:bg-secondary/50 transition-colors"
                data-testid={`button-number-${num}`}
              >
                {num}
              </motion.button>
            ))}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleBackspace}
              className="h-16 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-backspace"
            >
              <ArrowLeft size={24} />
            </motion.button>
          </div>

          <Button
            onClick={handleConfirm}
            className="w-full h-14 text-lg rounded-xl shadow-lg shadow-violet-500/20 bg-violet-600 hover:bg-violet-700"
            data-testid="button-confirm-amount"
          >
            Continue
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
            onClick={() => setStep("input")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-confirm"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Confirm Request</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <div className="bg-secondary rounded-2xl p-6 mb-8">
            <p className="text-muted-foreground text-sm mb-2">Amount</p>
            <p className="text-5xl font-bold font-heading mb-6">${amount}</p>

            <div className="space-y-4 border-t border-border pt-4">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Recipient</p>
                <p className="font-medium">{recipientName}</p>
              </div>
              {recipientPhone && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Phone</p>
                  <p className="font-medium">{recipientPhone}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-sm mb-1">From</p>
                <p className="font-medium">{user?.name}</p>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <div className="space-y-3">
            <Button
              onClick={handleCreateRequest}
              className="w-full h-14 text-lg rounded-xl shadow-lg shadow-violet-500/20 bg-violet-600 hover:bg-violet-700"
              data-testid="button-create-request"
            >
              Create Request
            </Button>
            <Button
              onClick={() => setStep("input")}
              variant="outline"
              className="w-full h-14 text-lg rounded-xl"
              data-testid="button-edit-request"
            >
              Edit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back-share">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Share Request</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-6 mb-8 text-white">
          <p className="text-violet-100 text-sm mb-2">Request Amount</p>
          <p className="text-5xl font-bold font-heading mb-2">${amount}</p>
          <p className="text-violet-100">From {user?.name}</p>
        </div>

        <div className="bg-secondary rounded-2xl p-4 mb-8">
          <p className="text-muted-foreground text-xs mb-2 uppercase font-semibold">Share Link</p>
          <div className="flex items-center space-x-2 bg-background rounded-lg p-3">
            <input
              type="text"
              value={requestLink}
              readOnly
              className="flex-1 bg-transparent text-sm font-mono outline-none text-muted-foreground"
              data-testid="input-request-link"
            />
            <button
              onClick={handleCopyLink}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              data-testid="button-copy-link"
            >
              {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="space-y-3 flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-4">Share via:</p>

          {recipientPhone && (
            <Button
              onClick={handleShareWhatsApp}
              className="w-full h-14 rounded-xl bg-green-600 hover:bg-green-700 flex items-center justify-center space-x-2"
              data-testid="button-share-whatsapp"
            >
              <MessageCircle size={20} />
              <span>Share on WhatsApp</span>
            </Button>
          )}

          <Button
            onClick={handleCopyLink}
            variant="outline"
            className="w-full h-14 rounded-xl flex items-center justify-center space-x-2"
            data-testid="button-share-link"
          >
            <Share2 size={20} />
            <span>Copy & Share Link</span>
          </Button>
        </div>

        <Link href="/">
          <Button
            className="w-full h-14 rounded-xl mt-4 bg-secondary hover:bg-secondary/80 text-foreground"
            data-testid="button-done"
          >
            Done
          </Button>
        </Link>
      </div>
    </div>
  );
}
