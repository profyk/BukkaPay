import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { transfer, fetchCards } from "../lib/api";
import { useCurrency } from "../lib/CurrencyContext";

export default function QRPay() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const [stage, setStage] = useState<"scan" | "amount" | "confirm" | "success">("scan");
  const [amount, setAmount] = useState("0");
  const [selectedCard, setSelectedCard] = useState("");
  const [scannedData, setScannedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanningActive, setScanningActive] = useState(false);

  const videoRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const trackRef = useRef<any>(null);
  const scanIntervalRef = useRef<any>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  useEffect(() => {
    const incomingWalletId = params.walletId as string | undefined;
    if (incomingWalletId) {
      stopWebCamera();
      setScannedData({ userId: incomingWalletId, username: incomingWalletId, walletId: incomingWalletId });
      setStage("amount");
    }
  }, [params.walletId]);

  useEffect(() => {
    if (Platform.OS === "web" && stage === "scan") {
      startWebCamera();
    }
    return () => {
      stopWebCamera();
    };
  }, [stage]);

  const startWebCamera = async () => {
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraReady(true);

      const capabilities = track.getCapabilities?.() || {};
      if ((capabilities as any).torch) {
        setTorchSupported(true);
      }

      startQRScanning(stream);
    } catch {
      setCameraReady(false);
    }
  };

  const stopWebCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setCameraReady(false);
    setTorchOn(false);
    setScanningActive(false);
  };

  const startQRScanning = (stream: any) => {
    const BarcodeDetectorAPI = (window as any).BarcodeDetector;
    if (!BarcodeDetectorAPI) return;

    BarcodeDetectorAPI.getSupportedFormats().then((formats: string[]) => {
      if (!formats.includes("qr_code")) return;

      const detector = new BarcodeDetectorAPI({ formats: ["qr_code"] });
      setScanningActive(true);

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !videoRef.current.readyState || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
            const rawValue = barcodes[0].rawValue;
            let parsed: any = { userId: rawValue, username: rawValue, walletId: rawValue };
            try { parsed = JSON.parse(rawValue); } catch {}
            handleScanResult(parsed);
          }
        } catch {}
      }, 500);
    });
  };

  const handleScanResult = (data: any) => {
    stopWebCamera();
    setScannedData(data);
    setStage("amount");
    toast({ title: "QR Code Scanned!", description: `Found ${data.username || data.userId}` });
  };

  const toggleTorch = async () => {
    if (!trackRef.current || !torchSupported) return;
    const next = !torchOn;
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      toast({ title: "Flashlight unavailable", description: "Your browser or device doesn't support torch control", variant: "destructive" });
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
      toast({ title: "Select Card", description: "Please select a card to send from", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await transfer(selectedCard, scannedData.userId, amount);
      setStage("success");
      toast({ title: "Payment Sent", description: `${currency.symbol}${amount} sent to ${scannedData.username}` });
      setTimeout(() => {
        router.push("/(tabs)");
      }, 2000);
    } catch (error: any) {
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (stage === "scan") {
    return (
      <View style={styles.scanContainer}>
        <View style={styles.scanHeader}>
          <TouchableOpacity style={styles.scanBackButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>Scan & Pay</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.scanContent}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {Platform.OS === "web" ? (
              <View style={styles.videoWrapper}>
                {}
                <video
                  ref={videoRef}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 } as any}
                  playsInline
                  muted
                />
                {!cameraReady && (
                  <View style={styles.cameraOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="large" />
                    <Text style={styles.scanPlaceholderText}>Starting camera...</Text>
                  </View>
                )}
                {cameraReady && scanningActive && (
                  <View style={styles.scanLine} />
                )}
              </View>
            ) : (
              <View style={styles.scanPlaceholder}>
                <Ionicons name="qr-code" size={80} color="rgba(255,255,255,0.3)" />
                <Text style={styles.scanPlaceholderText}>Camera not available in this view</Text>
              </View>
            )}
          </View>

          <Text style={styles.scanInstructions}>
            {cameraReady && scanningActive
              ? "Hold QR code steady inside the frame"
              : "Align QR code within the frame"}
          </Text>

          <TouchableOpacity
            style={[styles.flashButton, torchOn && styles.flashButtonActive]}
            onPress={toggleTorch}
            disabled={Platform.OS === "web" && !torchSupported && !cameraReady}
          >
            <Ionicons
              name={torchOn ? "flashlight" : "flashlight-outline"}
              size={24}
              color={torchOn ? "#FFDD00" : "#FFFFFF"}
            />
          </TouchableOpacity>

          {Platform.OS === "web" && cameraReady && !torchSupported && (
            <Text style={styles.torchHint}>Flashlight not supported on this device/browser</Text>
          )}
        </View>
      </View>
    );
  }

  if (stage === "amount") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStage("scan")}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Amount</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.recipientBox}>
          <Text style={styles.recipientLabel}>Sending to</Text>
          <Text style={styles.recipientName}>{scannedData?.username}</Text>
        </View>

        <View style={styles.amountDisplay}>
          <Text style={styles.amountDollar}>{currency.symbol}</Text>
          <Text style={styles.amountValue}>{amount}</Text>
        </View>

        <View style={styles.numpad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <TouchableOpacity key={num} style={styles.numKey} onPress={() => handleNumberClick(num.toString())}>
              <Text style={styles.numKeyText}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.numKey} onPress={() => handleNumberClick(".")}>
            <Text style={styles.numKeyText}>.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.numKey} onPress={() => handleNumberClick("0")}>
            <Text style={styles.numKeyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.numKey} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={24} color="#1A1A2E" />
          </TouchableOpacity>
        </View>

        <View style={styles.cardPickerContainer}>
          <Text style={styles.cardPickerLabel}>From Card</Text>
          <TouchableOpacity style={styles.cardPickerButton} onPress={() => setShowCardPicker(!showCardPicker)}>
            <Text style={styles.cardPickerText}>
              {selectedCard ? cards.find((c: any) => c.id === selectedCard)?.title || "Selected" : "Select a card"}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
          {showCardPicker && (
            <View style={styles.cardPickerDropdown}>
              {cards.map((card: any) => (
                <TouchableOpacity
                  key={card.id}
                  style={styles.cardPickerItem}
                  onPress={() => {
                    setSelectedCard(card.id);
                    setShowCardPicker(false);
                  }}
                >
                  <Text style={styles.cardPickerItemText}>{card.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.reviewButton} onPress={() => setStage("confirm")}>
          <Text style={styles.reviewButtonText}>Review Payment</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (stage === "confirm") {
    const selectedCardData = cards.find((c: any) => c.id === selectedCard);

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStage("amount")}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Payment</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.confirmCard}>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>To</Text>
            <Text style={styles.confirmValue}>{scannedData?.username}</Text>
            <Text style={styles.confirmSub}>{scannedData?.walletId}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>From</Text>
            <Text style={styles.confirmValue}>{selectedCardData?.title}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Amount</Text>
            <Text style={styles.confirmAmount}>{currency.symbol}{amount}</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[styles.sendButton, loading && styles.disabledButton]}
          onPress={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>Send Payment</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => setStage("amount")}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.centerContent]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={48} color="#FFFFFF" />
      </View>
      <Text style={styles.successTitle}>Payment Sent!</Text>
      <Text style={styles.successSubtitle}>Your payment has been completed</Text>

      <View style={styles.successCard}>
        <Text style={styles.successAmount}>{currency.symbol}{amount}</Text>
        <Text style={styles.successTo}>to {scannedData?.username}</Text>
      </View>

      <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/(tabs)")}>
        <Text style={styles.homeButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  scanContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scanHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  scanBackButton: {
    padding: 12,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scanContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  videoWrapper: {
    width: "100%",
    height: "100%",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    gap: 12,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    top: "50%",
    backgroundColor: "#7C3AED",
    opacity: 0.8,
  },
  corner: {
    position: "absolute",
    width: 48,
    height: 48,
    borderColor: "#7C3AED",
    zIndex: 10,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scanPlaceholder: {
    alignItems: "center",
    gap: 12,
  },
  scanPlaceholderText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  scanInstructions: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 32,
    marginBottom: 24,
    textAlign: "center",
  },
  simulateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  simulateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  flashButton: {
    padding: 16,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  flashButtonActive: {
    backgroundColor: "rgba(255,221,0,0.2)",
    borderColor: "rgba(255,221,0,0.5)",
  },
  torchHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 48,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  recipientBox: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  recipientLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  amountDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  amountDollar: {
    fontSize: 32,
    fontWeight: "700",
    color: "#6B7280",
    marginRight: 4,
  },
  amountValue: {
    fontSize: 56,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  numKey: {
    width: "31%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    alignItems: "center",
    justifyContent: "center",
  },
  numKeyText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  cardPickerContainer: {
    marginBottom: 16,
  },
  cardPickerLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  cardPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F8F9FA",
  },
  cardPickerText: {
    fontSize: 16,
    color: "#1A1A2E",
  },
  cardPickerDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  cardPickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  cardPickerItemText: {
    fontSize: 14,
    color: "#1A1A2E",
  },
  reviewButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  reviewButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 24,
    marginTop: 16,
  },
  confirmRow: {
    marginBottom: 16,
  },
  confirmLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  confirmValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  confirmSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  confirmAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  sendButton: {
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 32,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 32,
  },
  successCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 32,
  },
  successAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 4,
  },
  successTo: {
    fontSize: 14,
    color: "#6B7280",
  },
  homeButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  homeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
