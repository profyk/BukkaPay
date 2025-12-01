import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flashlight, FlashlightOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transfer, fetchCards } from "@/lib/api";
import jsQR from "jsqr";
import { motion } from "framer-motion";

export default function QRPay() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<"scan" | "amount" | "confirm" | "success">("scan");
  const [amount, setAmount] = useState("0");
  const [selectedCard, setSelectedCard] = useState("");
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  useEffect(() => {
    if (stage === "scan") {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [stage]);

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
        description: `$${amount} sent to ${scannedData.username}`,
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

  if (stage === "scan") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="px-6 pt-8 pb-4 flex items-center gap-4 relative z-10">
          <button
            onClick={() => navigate?.("/")}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            data-testid="button-back-qr"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-heading font-bold">Scan & Pay</h1>
        </header>

        <div className="flex-1 px-6 pb-8 flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-black rounded-2xl overflow-hidden aspect-square w-full max-w-sm relative">
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
          </div>

          <div className="mt-6 text-center text-sm text-white/70 mb-4">
            {cameraActive ? "Point camera at QR code to scan" : "Waiting for camera..."}
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
              setStage("amount");
            }}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors mb-3"
            data-testid="button-demo-scan"
          >
            Try Demo Scan
          </button>
        </div>
      </div>
    );
  }

  if (stage === "amount") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setStage("scan")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-amount"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Payment Amount</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <div className="bg-secondary rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-2">Sending to</p>
            <p className="font-semibold">{scannedData?.username}</p>
          </div>

          <div className="flex-1 flex items-center justify-center mb-8">
            <div className="text-center">
              <span className="text-4xl font-bold text-muted-foreground mr-1">$</span>
              <span className="text-6xl font-bold font-heading tracking-tighter">{amount}</span>
            </div>
          </div>

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

          <div className="space-y-2">
            <div>
              <label className="block text-sm font-medium mb-2">From Card</label>
              <select
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="select-card"
              >
                <option value="">Select a card</option>
                {cards.map((card: any) => (
                  <option key={card.id} value={card.id}>
                    {card.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setStage("confirm")}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold"
              data-testid="button-review"
            >
              Review Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "confirm") {
    const selectedCardData = cards.find((c: any) => c.id === selectedCard);
    
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setStage("amount")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-confirm"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Confirm Payment</h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-secondary rounded-2xl p-6 mb-8"
            data-testid="confirm-card"
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <p className="text-lg font-semibold">{scannedData?.username}</p>
                <p className="text-xs text-muted-foreground">{scannedData?.walletId}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <p className="text-lg font-semibold">{selectedCardData?.title}</p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground mb-1">Amount</p>
                <p className="text-3xl font-bold">${amount}</p>
              </div>
            </div>
          </motion.div>

          <div className="flex-1" />

          <div className="space-y-3">
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold disabled:opacity-50"
              data-testid="button-confirm"
            >
              {loading ? "Processing..." : "Send Payment"}
            </button>
            <button
              onClick={() => setStage("amount")}
              className="w-full h-12 rounded-lg border border-border hover:bg-secondary transition-colors font-semibold"
              data-testid="button-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="w-24 h-24 rounded-full bg-emerald-600 flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">✓</span>
        </div>
      </motion.div>

      <h1 className="text-3xl font-bold mb-2">Payment Sent!</h1>
      <p className="text-muted-foreground mb-8">Your payment has been completed</p>

      <div className="bg-secondary rounded-2xl p-6 w-full mb-8">
        <p className="text-4xl font-bold mb-2">${amount}</p>
        <p className="text-sm text-muted-foreground">to {scannedData?.username}</p>
      </div>

      <button
        onClick={() => navigate?.("/")}
        className="w-full h-12 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold"
        data-testid="button-home"
      >
        Back to Home
      </button>
    </div>
  );
}
