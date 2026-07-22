import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { sendMoney, fetchCards, lookupRecipient } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import PinPrompt from "../components/PinPrompt";

interface Recipient {
  id: string;
  name: string;
  username: string;
  walletId: string;
  avatar: string | null;
  verified: boolean;
}

export default function QRPay() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { toast } = useToast();
  const { colors } = useTheme();
  const [stage, setStage] = useState<"loading" | "error" | "amount" | "confirm" | "success">("loading");
  const [lookupError, setLookupError] = useState("");
  const [amount, setAmount] = useState("0");
  const [selectedCard, setSelectedCard] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  // The tab bar's camera scanner (scan.tsx) is the single real QR scanner in
  // the app — this screen only handles what happens after a scan, identified
  // by the walletId param it's pushed with. Reached without one (a stale
  // link, deep link, or someone navigating here directly), there's nothing
  // useful to do here since a second scanner used to live in this file and
  // was a redundant, independently-broken duplicate (browser-only barcode
  // API, expected JSON where the real QR encodes a plain string) — send the
  // user to the one real scanner instead of resurrecting it.
  useEffect(() => {
    const incomingWalletId = params.walletId as string | undefined;
    if (!incomingWalletId) {
      router.replace("/(tabs)/scan" as any);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await lookupRecipient(incomingWalletId);
        if (cancelled) return;
        setRecipient(data);
        setStage("amount");
      } catch (e: any) {
        if (cancelled) return;
        setLookupError(e.message || "Could not find a BukkaPay user for this QR code.");
        setStage("error");
      }
    })();
    return () => { cancelled = true; };
  }, [params.walletId]);

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

  const handleConfirm = () => {
    if (!selectedCard || !recipient) {
      toast({ title: "Select Card", description: "Please select a card to send from", variant: "destructive" });
      return;
    }
    setShowPinPrompt(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (!recipient) return;
    setLoading(true);
    try {
      await sendMoney(selectedCard, recipient.id, amount, { pin });
      setShowPinPrompt(false);
      setStage("success");
      toast({ title: "Payment Sent", description: `R${amount} sent to ${recipient.name}` });
      setTimeout(() => {
        router.push("/(tabs)");
      }, 2000);
    } catch (error: any) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  if (stage === "loading") {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Looking up recipient…</Text>
      </View>
    );
  }

  if (stage === "error") {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <View style={styles.errorCircle}>
          <Ionicons name="alert-circle" size={44} color="#fff" />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text, marginBottom: 8 }]}>Recipient Not Found</Text>
        <Text style={[styles.loadingText, { color: colors.textMuted, textAlign: "center" }]}>{lookupError}</Text>
        <TouchableOpacity style={[styles.homeButton, { marginTop: 24 }]} onPress={() => router.replace("/(tabs)/scan" as any)}>
          <Text style={styles.homeButtonText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (stage === "amount") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/(tabs)/scan" as any)}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Amount</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.recipientBox, { backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={styles.recipientAvatar}>
            <Text style={styles.recipientAvatarText}>{(recipient?.name || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.recipientLabel, { color: colors.textMuted }]}>Sending to</Text>
              {recipient?.verified && <Ionicons name="checkmark-circle" size={14} color="#10B981" />}
            </View>
            <Text style={[styles.recipientName, { color: colors.text }]}>{recipient?.name}</Text>
            <Text style={[styles.recipientLabel, { color: colors.textMuted }]}>@{recipient?.username}</Text>
          </View>
        </View>

        <View style={styles.amountDisplay}>
          <Text style={[styles.amountDollar, { color: colors.textMuted }]}>R</Text>
          <Text style={[styles.amountValue, { color: colors.text }]}>{amount}</Text>
        </View>

        <View style={styles.numpad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <TouchableOpacity key={num} style={[styles.numKey, { backgroundColor: colors.surface }]} onPress={() => handleNumberClick(num.toString())}>
              <Text style={[styles.numKeyText, { color: colors.text }]}>{num}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.numKey, { backgroundColor: colors.surface }]} onPress={() => handleNumberClick(".")}>
            <Text style={[styles.numKeyText, { color: colors.text }]}>.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.numKey, { backgroundColor: colors.surface }]} onPress={() => handleNumberClick("0")}>
            <Text style={[styles.numKeyText, { color: colors.text }]}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.numKey, { backgroundColor: colors.surface }]} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.cardPickerContainer}>
          <Text style={[styles.cardPickerLabel, { color: colors.text }]}>From Card</Text>
          <TouchableOpacity style={[styles.cardPickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowCardPicker(!showCardPicker)}>
            <Text style={[styles.cardPickerText, { color: colors.text }]}>
              {selectedCard ? cards.find((c: any) => c.id === selectedCard)?.title || "Selected" : "Select a card"}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          {showCardPicker && (
            <View style={[styles.cardPickerDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {cards.map((card: any) => (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.cardPickerItem, { borderBottomColor: colors.divider }]}
                  onPress={() => {
                    setSelectedCard(card.id);
                    setShowCardPicker(false);
                  }}
                >
                  <Text style={[styles.cardPickerItemText, { color: colors.text }]}>{card.title}</Text>
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setStage("amount")}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Confirm Payment</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
          <View style={styles.confirmRow}>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>To</Text>
            <Text style={[styles.confirmValue, { color: colors.text }]}>{recipient?.name}</Text>
            <Text style={[styles.confirmSub, { color: colors.textMuted }]}>{recipient?.walletId}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>From</Text>
            <Text style={[styles.confirmValue, { color: colors.text }]}>{selectedCardData?.title}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <View style={styles.confirmRow}>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Amount</Text>
            <Text style={[styles.confirmAmount, { color: colors.text }]}>R{amount}</Text>
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
        <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={() => setStage("amount")}>
          <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>

        <PinPrompt
          visible={showPinPrompt}
          subtitle={`Confirm sending R${amount} to ${recipient?.name}`}
          onCancel={() => setShowPinPrompt(false)}
          onSubmit={handlePinSubmit}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={48} color="#FFFFFF" />
      </View>
      <Text style={[styles.successTitle, { color: colors.text }]}>Payment Sent!</Text>
      <Text style={[styles.successSubtitle, { color: colors.textMuted }]}>Your payment has been completed</Text>

      <View style={[styles.successCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.successAmount, { color: colors.text }]}>R{amount}</Text>
        <Text style={[styles.successTo, { color: colors.textMuted }]}>to {recipient?.name}</Text>
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
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  recipientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  recipientAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
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
