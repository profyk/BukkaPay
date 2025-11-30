import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Send, AlertCircle, Flashlight, FlashlightOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transfer } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import jsQR from "jsqr";

export default function ScanPay() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<"scan" | "confirm" | "success">("scan");
  const [scannedData, setScannedData] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<any[]>([]);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [scanningActive, setScanningActive] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const currentUser = getCurrentUser();

  useEffect(() => {
    if (stage === "scan") {
      startCamera();
    }
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [stage]);

  const startCamera = async () => {
    try {
      const constraints: any = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: "continuous",
          zoom: 1,
        },
        audio: false,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setScanningActive(true);
          startQRScanning();
        };
      }
    } catch (err: any) {
      toast({
        title: "Camera Error",
        description: err.name === "NotAllowedError" 
          ? "Camera permission denied. Please allow camera access in settings."
          : "Could not access camera. Try manual entry.",
        variant: "destructive",
      });
    }
  };

  const toggleFlashlight = async () => {
    try {
      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
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
      toast({
        title: "Flashlight Error",
        description: "Flashlight not supported on this device",
        variant: "destructive",
      });
    }
  };

  const startQRScanning = () => {
    const scanInterval = setInterval(() => {
      if (canvasRef.current && videoRef.current && scanningActive && stage === "scan") {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          
          try {
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
            if (qrCode) {
              try {
                const data = JSON.parse(qrCode.data);
                if (data.userId && data.username && data.walletId) {
                  setScanningActive(false);
                  setScannedData(data);
                  setStage("confirm");
                  clearInterval(scanInterval);
                  
                  toast({
                    title: "QR Code Scanned",
                    description: `Ready to send to ${data.username}`,
                    variant: "default",
                  });
                }
              } catch (e) {
                // Not JSON format, try string parsing
              }
            }
          } catch (err) {
            // Continue scanning
          }
        }
      }
    }, 300);

    return () => clearInterval(scanInterval);
  };

  const captureQRCode = async () => {
    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        try {
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
          
          if (qrCode) {
            try {
              const data = JSON.parse(qrCode.data);
              setScannedData(data);
              setStage("confirm");
              setScanningActive(false);
              
              toast({
                title: "QR Code Scanned",
                description: `Ready to send to ${data.username}`,
                variant: "default",
              });
            } catch (e) {
              toast({
                title: "Invalid QR Code",
                description: "QR code format not recognized",
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "No QR Code Found",
              description: "Could not detect QR code. Try again.",
              variant: "destructive",
            });
          }
        } catch (err) {
          toast({
            title: "Scan Failed",
            description: "Could not read QR code",
            variant: "destructive",
          });
        }
      }
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

      <div className="px-6">
        {stage === "scan" && (
          <div className="space-y-4">
            <div className="bg-black rounded-2xl overflow-hidden aspect-square relative group">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" width={400} height={400} />
              
              {/* Scanning Frame */}
              <div className="absolute inset-0">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              </div>

              {/* Scanning Line Animation */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" 
                     style={{ top: "40%", animation: "scan-line 2s infinite" }} />
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
            </div>

            <button
              onClick={captureQRCode}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-capture-qr"
            >
              Capture QR Code
            </button>

            <button
              onClick={() => {
                const demoData = {
                  userId: "user-456",
                  username: "alice_smith",
                  walletId: "BKP-XYZ789PQR",
                };
                setScannedData(demoData);
                setStage("confirm");
              }}
              className="w-full py-3 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition-colors"
              data-testid="button-demo-scan"
            >
              Demo Scan
            </button>

            <style>{`
              @keyframes scan-line {
                0% { top: 10%; }
                50% { top: 90%; }
                100% { top: 10%; }
              }
            `}</style>
          </div>
        )}

        {stage === "confirm" && scannedData && (
          <div className="space-y-6">
            <div className="bg-secondary rounded-2xl p-6">
              <p className="text-sm text-muted-foreground mb-2">Sending to</p>
              <h2 className="text-2xl font-heading font-bold">{scannedData.username}</h2>
              <p className="text-xs text-muted-foreground mt-2">ID: {scannedData.walletId}</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-2xl font-bold">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-2xl font-bold"
                  data-testid="input-amount"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Send from</label>
              <select
                value={selectedCard}
                onChange={(e) => setSelectedCard(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 bg-secondary"
                data-testid="select-card"
              >
                <option value="">Choose a card...</option>
                <option value="card-1">💳 Main Card - $5,000.00</option>
                <option value="card-2">🛒 Groceries - $450.00</option>
                <option value="card-3">🚗 Transport - $200.00</option>
              </select>
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
                data-testid="button-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading || !amount || !selectedCard}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                data-testid="button-send-payment"
              >
                <Send size={18} />
                Send ${amount}
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
              Redirecting in 2 seconds...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
