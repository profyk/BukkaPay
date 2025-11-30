import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Lock, Smartphone, Check, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "@/lib/api";
import { mapCardFromAPI } from "@/lib/mappers";
import { getCurrentUser } from "@/lib/auth";

export default function TapPay() {
  const [step, setStep] = useState<"select" | "auth" | "success">("select");
  const [selectedCard, setSelectedCard] = useState<string>("");
  const [authMethod, setAuthMethod] = useState<"pin" | "face">("pin");
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("$99.99");
  const [storeName, setStoreName] = useState("Tech Store");
  const [faceRecognitionActive, setFaceRecognitionActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const user = getCurrentUser();
  const { data: cards } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const mappedCards = cards?.map(mapCardFromAPI) || [];

  const startFaceRecognition = async () => {
    setFaceRecognitionActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      toast.error("Camera access denied. Use PIN instead.");
      setAuthMethod("pin");
      setFaceRecognitionActive(false);
    }
  };

  const captureFaceFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        // Simulate face recognition - in production, use a real face recognition API
        simulateFaceRecognition();
      }
    }
  };

  const simulateFaceRecognition = () => {
    setTimeout(() => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
      toast.success("Face recognized!");
      handleAuthSuccess();
    }, 1500);
  };

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(pin + num);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleVerifyPin = () => {
    if (pin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }
    if (pin === "1234") {
      toast.success("PIN verified!");
      handleAuthSuccess();
    } else {
      toast.error("Invalid PIN");
      setPin("");
    }
  };

  const handleAuthSuccess = () => {
    setStep("success");
    setFaceRecognitionActive(false);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
    }
  };

  const handleSelectCard = (cardId: string) => {
    setSelectedCard(cardId);
    setStep("auth");
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
          <h1 className="w-full text-center font-heading font-bold text-lg">
            Tap to Pay
          </h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          <div className="bg-secondary rounded-2xl p-6 mb-8">
            <p className="text-muted-foreground text-sm mb-2">Payment at</p>
            <h2 className="text-2xl font-bold mb-4">{storeName}</h2>
            <p className="text-4xl font-heading font-bold text-violet-600">
              {amount}
            </p>
          </div>

          <p className="text-sm font-medium text-muted-foreground mb-4">
            Select a card to pay with:
          </p>

          <div className="space-y-3 flex-1">
            {mappedCards.length > 0 ? (
              mappedCards.map((card, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => handleSelectCard(card.id)}
                  className="w-full p-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 text-white text-left hover:shadow-lg hover:shadow-primary/20 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  data-testid={`button-card-select-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{card.title}</p>
                      <p className="text-sm text-slate-300">
                        {card.cardNumber}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Balance: ${card.balance}
                      </p>
                    </div>
                    <Smartphone size={24} className="text-violet-400" />
                  </div>
                </motion.button>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No cards available
              </div>
            )}
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

  if (step === "auth") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setStep("select")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back-auth"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">
            Authenticate
          </h1>
        </header>

        <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
          {!faceRecognitionActive ? (
            <>
              <div className="flex gap-2 mb-8">
                <button
                  onClick={() => setAuthMethod("pin")}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    authMethod === "pin"
                      ? "bg-violet-600 text-white"
                      : "bg-secondary text-muted-foreground"
                  }`}
                  data-testid="button-method-pin"
                >
                  <Lock size={18} className="inline mr-2" />
                  PIN
                </button>
                <button
                  onClick={() => setAuthMethod("face")}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    authMethod === "face"
                      ? "bg-violet-600 text-white"
                      : "bg-secondary text-muted-foreground"
                  }`}
                  data-testid="button-method-face"
                >
                  <Camera size={18} className="inline mr-2" />
                  Face ID
                </button>
              </div>

              {authMethod === "pin" ? (
                <>
                  <div className="flex-1 flex items-center justify-center mb-8">
                    <div className="text-center">
                      <p className="text-muted-foreground text-sm mb-4">
                        Enter your 4-digit PIN
                      </p>
                      <div className="flex justify-center gap-3 mb-6">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center"
                            data-testid={`pin-digit-${i}`}
                          >
                            {pin[i] ? "●" : "○"}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <motion.button
                        key={num}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleNumberClick(num.toString())}
                        className="h-14 rounded-lg text-lg font-semibold bg-secondary hover:bg-secondary/80 transition-colors"
                        data-testid={`button-pin-${num}`}
                      >
                        {num}
                      </motion.button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleNumberClick("0")}
                      className="h-14 rounded-lg text-lg font-semibold bg-secondary hover:bg-secondary/80 transition-colors col-span-2"
                      data-testid="button-pin-0"
                    >
                      0
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={handleBackspace}
                      className="h-14 rounded-lg flex items-center justify-center bg-secondary hover:bg-secondary/80 transition-colors"
                      data-testid="button-backspace"
                    >
                      ←
                    </motion.button>
                  </div>

                  <Button
                    onClick={handleVerifyPin}
                    disabled={pin.length !== 4}
                    className="w-full h-14 text-lg rounded-xl shadow-lg shadow-violet-500/20 bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
                    data-testid="button-verify-pin"
                  >
                    Verify PIN
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <Camera size={64} className="text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center mb-8">
                      Face ID will capture and verify your identity
                    </p>
                  </div>

                  <Button
                    onClick={startFaceRecognition}
                    className="w-full h-14 text-lg rounded-xl shadow-lg shadow-violet-500/20 bg-violet-600 hover:bg-violet-700"
                    data-testid="button-start-face-id"
                  >
                    <Camera size={20} className="mr-2" />
                    Start Face ID
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-center text-muted-foreground mb-4">
                Scanning face...
              </p>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full aspect-square rounded-2xl bg-black mb-4"
                data-testid="video-face-recognition"
              />
              <canvas
                ref={canvasRef}
                className="hidden"
                width={320}
                height={320}
              />

              <motion.button
                onClick={captureFaceFrame}
                className="w-full h-14 text-lg rounded-xl shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700"
                whileTap={{ scale: 0.95 }}
                data-testid="button-capture-face"
              >
                Capture & Verify
              </motion.button>
            </>
          )}
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
            <Check size={48} className="text-white" />
          </div>
        </motion.div>

        <h1 className="text-3xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-muted-foreground mb-2">Transaction completed</p>

        <div className="bg-secondary rounded-2xl p-6 w-full my-8">
          <p className="text-muted-foreground text-sm mb-2">Amount</p>
          <p className="text-4xl font-bold mb-6">{amount}</p>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">Merchant</p>
              <p className="font-medium">{storeName}</p>
            </div>
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">Card</p>
              <p className="font-medium">
                {mappedCards[0]?.title || "Payment Card"}
              </p>
            </div>
            <div className="text-left">
              <p className="text-muted-foreground text-sm mb-1">Reference</p>
              <p className="font-mono text-sm">TX-{Date.now().toString().slice(-8)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-3">
        <Link href="/">
          <Button
            className="w-full h-14 rounded-xl bg-violet-600 hover:bg-violet-700"
            data-testid="button-back-home"
          >
            Back to Home
          </Button>
        </Link>
        <button
          onClick={() => {
            setStep("select");
            setPin("");
            setSelectedCard("");
          }}
          className="w-full h-14 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-medium"
          data-testid="button-new-payment"
        >
          Make Another Payment
        </button>
      </div>
    </div>
  );
}
