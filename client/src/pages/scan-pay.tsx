import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Send, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { transfer } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export default function ScanPay() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<"scan" | "confirm" | "success">("scan");
  const [scannedData, setScannedData] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<any[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast({
        title: "Camera Error",
        description: "Could not access camera. Try manual entry.",
        variant: "destructive",
      });
    }
  };

  const captureQRCode = async () => {
    if (canvasRef.current && videoRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        try {
          // Simulate QR code detection - in production use jsQR or similar library
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          // For now, just show a demo of parsed data
          const demoData = {
            userId: "user-123",
            username: "john_doe",
            walletId: "BKP-ABC123DEF",
          };
          setScannedData(demoData);
          setStage("confirm");
          
          toast({
            title: "QR Code Scanned",
            description: `Ready to send to ${demoData.username}`,
            variant: "default",
          });
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
            <div className="bg-black rounded-2xl overflow-hidden aspect-square relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" width={400} height={400} />
              <div className="absolute inset-0 border-4 border-primary/50 rounded-2xl" />
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
