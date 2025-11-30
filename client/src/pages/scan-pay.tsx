import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send, AlertCircle, QrCode, Wallet, Smartphone, Landmark, Flashlight, FlashlightOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transfer, fetchCards } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getCountries, getBanksByCountry } from "@/lib/banksData";
import jsQR from "jsqr";

export default function SendMoney() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<"method" | "scan" | "wallet-id" | "amount" | "confirm" | "success">("method");
  const [paymentMethod, setPaymentMethod] = useState<"qr" | "bukka" | "mobile" | "bank" | null>(null);
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [loading, setLoading] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [bankDetails, setBankDetails] = useState({
    accountName: "",
    accountNumber: "",
    bankName: "",
    country: "",
  });

  const [recipientData, setRecipientData] = useState<any>(null);
  const currentUser = getCurrentUser();

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  // Start camera for QR scanning
  useEffect(() => {
    if (stage === "scan" && paymentMethod === "qr") {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [stage, paymentMethod]);

  // Real-time QR scanning
  useEffect(() => {
    if (!cameraActive || !videoRef.current || !canvasRef.current) return;

    scanIntervalRef.current = setInterval(() => {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, canvas.width, canvas.height);

        if (qrCode?.data) {
          try {
            const data = JSON.parse(qrCode.data);
            if (data.userId && data.username && data.walletId) {
              stopCamera();
              setScannedData(data);
              setRecipientData(data);
              setStage("amount");
              toast({
                title: "QR Code Scanned!",
                description: `Found ${data.username}`,
                variant: "default",
              });
            }
          } catch (e) {
            // Invalid JSON, continue scanning
          }
        }
      } catch (err) {
        console.error("Scan error:", err);
      }
    }, 200);

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [cameraActive, toast]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => {
          setCameraActive(true);
        }).catch(err => {
          console.error("Play error:", err);
          toast({
            title: "Camera Error",
            description: "Could not start video playback",
            variant: "destructive",
          });
        });
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      toast({
        title: "Camera Error",
        description: err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access."
          : "Could not access camera",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    setCameraActive(false);
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleFlashlight = async () => {
    try {
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities() as any;
          if (capabilities.torch) {
            await videoTrack.applyConstraints({
              advanced: [{ torch: !flashlightOn }] as any,
            });
            setFlashlightOn(!flashlightOn);
          }
        }
      }
    } catch (err) {
      console.error("Flashlight error:", err);
    }
  };

  const handleMethodSelect = (method: "bukka" | "mobile" | "bank") => {
    setPaymentMethod(method);
    setStage("wallet-id");
  };

  const handleWalletIdContinue = () => {
    if (!walletId.trim()) {
      toast({
        title: "Invalid ID",
        description: "Please enter a wallet or wallet ID",
        variant: "destructive",
      });
      return;
    }
    setRecipientData({
      id: walletId,
      type: paymentMethod,
    });
    setStage("amount");
  };

  const handleBankDetailsContinue = () => {
    const { accountName, accountNumber, bankName, country } = bankDetails;
    if (!accountName || !accountNumber || !bankName || !country) {
      toast({
        title: "Missing Details",
        description: "Please fill in all bank details",
        variant: "destructive",
      });
      return;
    }
    setRecipientData({
      accountName,
      accountNumber,
      bankName,
      country,
      type: "bank",
    });
    setStage("amount");
  };

  const handleAmountContinue = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    if (!selectedCard) {
      toast({
        title: "Select Card",
        description: "Please select a card to send from",
        variant: "destructive",
      });
      return;
    }
    setStage("confirm");
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      if (paymentMethod === "qr") {
        await transfer(selectedCard, scannedData.userId, amount);
      } else if (paymentMethod === "bukka") {
        await transfer(selectedCard, recipientData.id, amount);
      } else if (paymentMethod === "mobile") {
        await transfer(selectedCard, recipientData.id, amount);
      } else if (paymentMethod === "bank") {
        await transfer(selectedCard, recipientData.accountNumber, amount);
      }

      setStage("success");
      toast({
        title: "Payment Sent",
        description: `${amount} sent successfully`,
        variant: "default",
      });

      setTimeout(() => {
        navigate?.("/");
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Transfer Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 pt-8 pb-6 flex items-center gap-4">
        <button
          onClick={() => {
            if (stage === "method") {
              navigate?.("/");
            } else {
              setStage("method");
              setPaymentMethod(null);
              setWalletId("");
              setAmount("");
              setBankDetails({ accountName: "", accountNumber: "", bankName: "", country: "" });
              stopCamera();
            }
          }}
          className="p-2 hover:bg-secondary rounded-xl transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-heading font-bold">Send Money</h1>
      </header>

      <div className="px-6 pb-8">
        {/* Payment Method Selection */}
        {stage === "method" && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">How would you like to send?</h2>
              <p className="text-muted-foreground">Choose your preferred payment method</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setPaymentMethod("qr");
                  setStage("scan");
                }}
                className="w-full p-5 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-all text-left group"
                data-testid="button-method-qr"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/20">
                    <QrCode size={24} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Scan QR Code</h3>
                    <p className="text-sm text-muted-foreground">Fast P2P payment with BukkaPay users</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect("bukka")}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                data-testid="button-method-bukka"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Wallet size={24} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">BukkaPay Wallet ID</h3>
                    <p className="text-sm text-muted-foreground">Send using wallet ID number</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect("mobile")}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                data-testid="button-method-mobile"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Smartphone size={24} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Mobile Wallet International</h3>
                    <p className="text-sm text-muted-foreground">Send to mobile wallets worldwide</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect("bank")}
                className="w-full p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                data-testid="button-method-bank"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Landmark size={24} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Bank Account</h3>
                    <p className="text-sm text-muted-foreground">Send to any bank account worldwide</p>
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => navigate?.("/")}
              className="w-full py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
              data-testid="button-cancel"
            >
              Cancel
            </button>
          </div>
        )}

        {/* QR Code Scanner */}
        {stage === "scan" && paymentMethod === "qr" && (
          <div className="space-y-4 py-8">
            <div className="bg-black rounded-2xl overflow-hidden aspect-square relative">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scanning Frame Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              </div>

              {/* Scanning Line Animation */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                  style={{
                    top: "50%",
                    animation: "scan-line 2s infinite",
                  }}
                />
              </div>

              {/* Flashlight Button */}
              <button
                onClick={toggleFlashlight}
                className="absolute top-4 right-4 p-3 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm border border-white/20 transition-all"
                data-testid="button-flashlight"
              >
                {flashlightOn ? (
                  <Flashlight size={20} className="text-yellow-300" />
                ) : (
                  <FlashlightOff size={20} className="text-white" />
                )}
              </button>

              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="animate-spin mb-4">
                      <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
                    </div>
                    <p className="text-white text-sm">Starting camera...</p>
                  </div>
                </div>
              )}

              <style>{`
                @keyframes scan-line {
                  0% { transform: translateY(-100%); }
                  50% { transform: translateY(100%); }
                  100% { transform: translateY(-100%); }
                }
              `}</style>
            </div>

            <div className="space-y-2 text-center">
              <p className="text-xs text-muted-foreground">
                {cameraActive ? "Point camera at QR code to scan" : "Waiting for camera..."}
              </p>
            </div>

            <button
              onClick={() => {
                const demoData = {
                  userId: "user-456",
                  username: "alice_smith",
                  walletId: "BKP-XYZ789PQR",
                };
                setScannedData(demoData);
                setRecipientData(demoData);
                stopCamera();
                setStage("amount");
              }}
              className="w-full py-3 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors"
              data-testid="button-demo-scan"
            >
              Try Demo Scan
            </button>

            <button
              onClick={() => {
                stopCamera();
                setStage("method");
              }}
              className="w-full py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
              data-testid="button-back-qr"
            >
              Back
            </button>
          </div>
        )}

        {/* Wallet ID / Recipient Input */}
        {stage === "wallet-id" && paymentMethod !== "bank" && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">Recipient Details</h2>
              <p className="text-muted-foreground">
                {paymentMethod === "bukka"
                  ? "Enter the BukkaPay wallet ID"
                  : "Enter the mobile wallet ID or phone number"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                {paymentMethod === "bukka" ? "BukkaPay Wallet ID" : "Mobile Wallet ID"}
              </label>
              <input
                type="text"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                placeholder={paymentMethod === "bukka" ? "BKP-XXXXXXXX" : "Wallet ID or phone number"}
                className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                data-testid="input-wallet-id"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStage("method");
                  setPaymentMethod(null);
                }}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
                data-testid="button-back-method"
              >
                Back
              </button>
              <button
                onClick={handleWalletIdContinue}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-continue-wallet"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Bank Details Input */}
        {stage === "wallet-id" && paymentMethod === "bank" && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">Bank Details</h2>
              <p className="text-muted-foreground">Enter the recipient's bank account information</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Account Holder Name</label>
                <input
                  type="text"
                  value={bankDetails.accountName}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="input-account-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Country</label>
                <select
                  value={bankDetails.country}
                  onChange={(e) => setBankDetails({ ...bankDetails, country: e.target.value, bankName: "" })}
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
                  data-testid="select-country"
                >
                  <option value="">Select a country...</option>
                  {getCountries().map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Bank Name</label>
                <select
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                  disabled={!bankDetails.country}
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background disabled:opacity-50"
                  data-testid="select-bank"
                >
                  <option value="">
                    {bankDetails.country ? "Select a bank..." : "Choose a country first..."}
                  </option>
                  {bankDetails.country && getBanksByCountry(bankDetails.country).map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Account Number</label>
                <input
                  type="text"
                  value={bankDetails.accountNumber}
                  onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                  placeholder="Account number or IBAN"
                  className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid="input-account-number"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStage("method");
                  setPaymentMethod(null);
                }}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
                data-testid="button-back-method-bank"
              >
                Back
              </button>
              <button
                onClick={handleBankDetailsContinue}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-continue-bank"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Amount Selection */}
        {stage === "amount" && recipientData && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">How much to send?</h2>
              <p className="text-muted-foreground">Enter the amount and select the card to send from</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-3xl font-bold text-primary">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-3xl font-bold"
                  data-testid="input-amount"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Send from</label>
              <select
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                disabled={cardsLoading}
                className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 bg-secondary disabled:opacity-50"
                data-testid="select-card"
              >
                <option value="">
                  {cardsLoading ? "Loading cards..." : "Choose a card..."}
                </option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.title} - ${parseFloat(card.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (paymentMethod === "qr") {
                    setStage("scan");
                  } else {
                    setStage("wallet-id");
                  }
                }}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
                data-testid="button-back-amount"
              >
                Back
              </button>
              <button
                onClick={handleAmountContinue}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-continue-amount"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {stage === "confirm" && recipientData && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">Confirm Payment</h2>
              <p className="text-muted-foreground">Review the details before sending</p>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-6 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-2">Sending to</p>
              {paymentMethod === "bank" ? (
                <>
                  <h2 className="text-3xl font-heading font-bold text-primary mb-1">{recipientData.accountName}</h2>
                  <p className="text-xs text-muted-foreground">{recipientData.bankName} • {recipientData.country}</p>
                  <p className="text-xs text-muted-foreground mt-1">Account: {recipientData.accountNumber}</p>
                </>
              ) : paymentMethod === "qr" ? (
                <>
                  <h2 className="text-3xl font-heading font-bold text-primary mb-1">{recipientData.username}</h2>
                  <p className="text-xs text-muted-foreground">ID: {recipientData.walletId}</p>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-heading font-bold text-primary mb-1">{recipientData.id}</h2>
                  <p className="text-xs text-muted-foreground">
                    {paymentMethod === "bukka" ? "BukkaPay Wallet" : "Mobile Wallet"}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Amount</p>
                <p className="text-2xl font-bold text-primary">${amount}</p>
              </div>
              <div className="bg-secondary rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">From Card</p>
                <p className="text-sm font-semibold">{cards.find(c => c.id === selectedCard)?.title || "Loading..."}</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex gap-3">
              <AlertCircle size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Security:</strong> Verify all details are correct before confirming.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStage("amount")}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
                data-testid="button-edit-amount"
              >
                Edit
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                data-testid="button-send-payment"
              >
                <Send size={18} />
                {loading ? "Sending..." : `Pay $${amount}`}
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {stage === "success" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="text-2xl font-heading font-bold text-center">Payment Sent!</h2>
            <p className="text-muted-foreground text-center">
              ${amount} has been sent successfully
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Redirecting to home...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
