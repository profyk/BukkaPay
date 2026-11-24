import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const logoImage = require("../assets/logo.png");

/** The one BukkaPay card design: the home wallet card, every wallet in the
 *  Cards list, the card detail screen and the add-wallet preview all use it. */
export interface WalletCardProps {
  title: string;
  balance: number;
  currency: string;               // symbol, e.g. "R"
  cardNumber?: string | null;     // masked by the API ("•••• •••• •••• 1234")
  expiryDate?: string | null;     // "MM/YY" from the issuer
  holderName?: string | null;
  cardStatus?: string | null;     // issued-card status
  showBalanceToggle?: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  pending: "Card being issued…",
  pending_kyc: "Verify your ID to activate",
  no_funds: "Paused · top up to use",
  frozen: "Card frozen",
  cancelled: "Card cancelled",
};

export default function WalletCard({
  title, balance, currency, cardNumber, expiryDate, holderName, cardStatus, showBalanceToggle = true,
}: WalletCardProps) {
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("showWalletBalance").then((v) => { if (v !== null) setShowBalance(v === "true"); }).catch(() => {});
  }, []);

  const toggleBalance = async () => {
    const next = !showBalance;
    setShowBalance(next);
    await AsyncStorage.setItem("showWalletBalance", String(next)).catch(() => {});
  };

  // Card numbers only ever come from the card issuer, already masked. Never
  // invent digits: without an issued number, show the card's status instead.
  const hasNumber = /\d{4}/.test(cardNumber || "");
  const numberText = hasNumber ? cardNumber : (cardStatus ? STATUS_TEXT[cardStatus] ?? "Card not available" : "Visa card coming soon");
  const frozen = cardStatus === "frozen";
  const amount = Number.isFinite(balance) ? balance : 0;

  return (
    <View style={[styles.card, frozen && styles.frozen]}>
      <Image source={logoImage} style={styles.bgLogo} />
      <View style={styles.glow} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            <Image source={logoImage} style={styles.cardLogo} />
            <View>
              <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
              <Text style={styles.subtitleText}>BukkaPay</Text>
            </View>
          </View>
          {frozen ? <Ionicons name="snow" size={20} color="#BFDBFE" accessibilityLabel="Frozen" />
            : <Text style={styles.visaText}>VISA</Text>}
        </View>

        <View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Available balance</Text>
            {showBalanceToggle && (
              <TouchableOpacity onPress={toggleBalance} style={styles.eyeButton} accessibilityLabel={showBalance ? "Hide balance" : "Show balance"}>
                <Ionicons name={showBalance ? "eye-outline" : "eye-off-outline"} size={16} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.balanceAmount}>
            {showBalance || !showBalanceToggle
              ? `${currency}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `${currency}${"•".repeat(8)}`}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardNumber, !hasNumber && styles.cardStatus]} numberOfLines={1}>{numberText}</Text>
            {!!holderName && <Text style={styles.holder} numberOfLines={1}>{holderName.toUpperCase()}</Text>}
          </View>
          {hasNumber && !!expiryDate && expiryDate !== "—" && (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.expiryLabel}>VALID THRU</Text>
              <Text style={styles.expiry}>{expiryDate}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20, padding: 22, aspectRatio: 1.58, overflow: "hidden", elevation: 8,
    shadowColor: "#001A72", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12,
    backgroundColor: "#001A72",
  },
  frozen: { backgroundColor: "#1E2A4A" },
  bgLogo: { position: "absolute", width: 200, height: 200, right: -40, bottom: -40, opacity: 0.06, borderRadius: 40 },
  glow: { position: "absolute", width: 260, height: 260, borderRadius: 130, top: -140, left: -90, backgroundColor: "rgba(56,130,255,0.18)" },
  content: { flex: 1, justifyContent: "space-between", zIndex: 1 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  cardLogo: { width: 36, height: 36, borderRadius: 10 },
  titleText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  subtitleText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "500", marginTop: 1 },
  visaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 18, fontStyle: "italic", opacity: 0.8 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500" },
  eyeButton: { padding: 4, borderRadius: 8 },
  balanceAmount: { color: "#FFFFFF", fontSize: 30, fontWeight: "700", letterSpacing: -0.5, marginTop: 2 },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 },
  cardNumber: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "monospace", letterSpacing: 2 },
  cardStatus: { fontFamily: undefined, letterSpacing: 0, fontWeight: "600" },
  holder: { color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 1, marginTop: 4 },
  expiryLabel: { color: "rgba(255,255,255,0.45)", fontSize: 8, letterSpacing: 1 },
  expiry: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
});
