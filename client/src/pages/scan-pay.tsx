import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send, AlertCircle, Flashlight, FlashlightOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transfer, fetchCards } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import jsQR from "jsqr";

export default function ScanPay() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<"enter-amount" | "scan" | "confirm" | "success">("enter-amount");
  const [scannedData, setScannedData] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [loading, setLoading] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentUser = getCurrentUser();

  // Fetch user's cards
  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  // Set default card when cards load
  useEffect(() => {
    if (cards.length > 0 && !selectedCard) {
      setSelectedCard(cards[0].id);
    }
  }, [cards, selectedCard]);

  // Start camera when entering scan stage
  useEffect(() => {
    if (stage === "scan") {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [stage]);

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
              setStage("confirm");
              toast({
                title: "QR Code Scanned!",
                description: `Ready to send to ${data.username}`,
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
          } else {
            toast({
              title: "Not Supported",
              description: "Flashlight not available on this device",
              variant: "destructive",
            });
          }
        }
      }
    } catch (err) {
      console.error("Flashlight error:", err);
    }
  };

  const handleSend = async () => {
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

    setLoading(true);
    try {
      await transfer(selectedCard, scannedData.userId, amount);
      setStage("success");

      toast({
        title: "Payment Sent",
        description: `${amount} sent to ${scannedData.username}`,
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
          onClick={() => navigate?.("/")}
          className="p-2 hover:bg-secondary rounded-xl transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-heading font-bold">Send Money</h1>
      </header>

      <div className="px-6 pb-8">
        {stage === "enter-amount" && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">How much to send?</h2>
              <p className="text-muted-foreground">Enter the amount and we'll scan the recipient's code</p>
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

            <button
              onClick={() => {
                if (!amount || parseFloat(amount) <= 0) {
                  toast({
                    title: "Invalid Amount",
                    description: "Please enter a valid amount",
                    variant: "destructive",
                  });
                  return;
                }
                setStage("scan");
              }}
              className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors text-lg"
              data-testid="button-continue-to-scan"
            >
              Continue to Scan
            </button>

            <button
              onClick={() => navigate?.("/")}
              className="w-full py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
              data-testid="button-cancel-pay"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === "scan" && (
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
              <p className="text-sm font-medium">Amount: <span className="text-primary font-bold text-lg">${amount}</span></p>
              <p className="text-xs text-muted-foreground">
                {cameraActive ? "Point camera at QR code" : "Waiting for camera..."}
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
                stopCamera();
                setStage("confirm");
              }}
              className="w-full py-3 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors"
              data-testid="button-demo-scan"
            >
              Try Demo Scan
            </button>

            <button
              onClick={() => {
                stopCamera();
                setStage("enter-amount");
              }}
              className="w-full py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
              data-testid="button-back-to-amount"
            >
              Back
            </button>
          </div>
        )}

        {stage === "confirm" && scannedData && (
          <div className="space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold">Confirm Payment</h2>
              <p className="text-muted-foreground">Review the details before sending</p>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-6 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-2">Sending to</p>
              <h2 className="text-3xl font-heading font-bold text-primary mb-1">{scannedData.username}</h2>
              <p className="text-xs text-muted-foreground">ID: {scannedData.walletId}</p>
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
                <strong>Security:</strong> Verify the recipient name matches before confirming payment.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStage("scan")}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-secondary transition-colors font-semibold"
                data-testid="button-scan-again"
              >
                Scan Again
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

        {stage === "success" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="text-2xl font-heading font-bold text-center">Payment Sent!</h2>
            <p className="text-muted-foreground text-center">
              ${amount} has been sent to {scannedData.username}
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
