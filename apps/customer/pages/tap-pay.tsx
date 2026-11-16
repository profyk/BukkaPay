import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCards, fetchIssuedCard, simulateCardPayment } from "../lib/api";
import { API_BASE } from "../lib/config";
import { getCurrency } from "../lib/currency";
import { queryClient } from "../lib/queryClient";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

const WALLET = Platform.OS === "ios" ? "apple_pay" : "google_pay";
const WALLET_LABEL = Platform.OS === "ios" ? "Apple Wallet" : "Google Wallet";
// The sandbox simulator only exists on non-production APIs.
const IS_SANDBOX_API = !/^https:\/\/api\.bukkapay\.com/.test(API_BASE);

/**
 * Tap to pay. Real contactless payments go through the phone's wallet
 * (Apple Pay / Google Pay) using a Visa token for the default wallet's
 * card, so they work on any contactless terminal worldwide. Each tap is
 * authorized live against the wallet balance by BukkaPay.
 */
export default function TapPay() {
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: wallets, isLoading } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const wallet = (wallets || []).find((w: any) => w.isDefault) || (wallets || [])[0];
  const issuedId: string | undefined = wallet?.issuedCard?.id;
  const { data: card } = useQuery({ queryKey: ["issued-card", issuedId], queryFn: () => fetchIssuedCard(issuedId!), enabled: !!issuedId });
  const token = card?.walletTokens.find((t) => t.wallet === WALLET && t.status !== "deleted");

  const simulate = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const a = await simulateCardPayment(card.id, { action: "authorize", amount, merchantName: "Sandbox Café", channel: "wallet_token" });
      if (!a.approved) {
        toast({ title: "Declined", description: a.declineReason || "Declined", variant: "destructive" });
      } else {
        await simulateCardPayment(card.id, { action: "clear", amount, authorizationId: a.authorizationId, merchantName: "Sandbox Café" });
        toast({ title: "Paid", description: `${getCurrency(wallet.currency).symbol}${amount} at Sandbox Café` });
        setAmount("");
      }
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["card-activity"] });
    } catch (e: any) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Tap to Pay</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? <ActivityIndicator color={colors.primary} /> : (
        <View style={styles.body}>
          <View style={[styles.hero, { backgroundColor: colors.primary }]}>
            <Ionicons name="phone-portrait-outline" size={40} color="#fff" />
          </View>

          {!card || card.status === "pending_kyc" ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Get your Visa card first</Text>
              <Text style={[styles.text, { color: colors.textMuted }]}>Tap to pay uses your wallet's Visa card. Verify your identity to activate it.</Text>
              <Primary label="Open my card" onPress={() => wallet && router.push({ pathname: "/(screens)/card", params: { walletId: wallet.id } } as any)} colors={colors} />
            </>
          ) : token?.status === "active" ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Ready to tap</Text>
              <Text style={[styles.text, { color: colors.textMuted }]}>
                Hold your phone near any contactless terminal. {WALLET_LABEL} pays with your {wallet.currency} card ending {card.last4}; BukkaPay approves it against your balance of {getCurrency(wallet.currency).symbol}{Number(wallet.balance).toFixed(2)}.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>{token ? "Setting up tap to pay…" : `Add your card to ${WALLET_LABEL}`}</Text>
              <Text style={[styles.text, { color: colors.textMuted }]}>
                Your phone's wallet keeps a secure Visa token for your card, so you can pay on any contactless terminal around the world.
              </Text>
              <Primary label="Set up tap to pay" onPress={() => router.push({ pathname: "/(screens)/card", params: { walletId: wallet.id } } as any)} colors={colors} />
            </>
          )}

          {IS_SANDBOX_API && card?.status === "active" && (
            <View style={[styles.sandbox, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textMuted }]}>SANDBOX · simulate a tap</Text>
              <TextInput
                value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount"
                placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
              <Primary label={busy ? "Paying…" : "Simulate tap"} onPress={simulate} disabled={busy || !Number(amount)} colors={colors} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Primary({ label, onPress, disabled, colors }: { label: string; onPress: () => void; disabled?: boolean; colors: any }) {
  return (
    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingHorizontal: 20, paddingBottom: 8 },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  body: { padding: 24, alignItems: "center", gap: 14 },
  hero: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  text: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  label: { fontSize: 11, letterSpacing: 0.5, fontWeight: "700" },
  primaryBtn: { alignSelf: "stretch", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sandbox: { alignSelf: "stretch", borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 14, gap: 8, marginTop: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
