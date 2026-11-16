import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Switch, ActivityIndicator, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import PremiumCard from "../components/PremiumCard";
import PinPrompt from "../components/PinPrompt";
import {
  addCardToWallet, cardAuthorizations, fetchCards, fetchIssuedCard, freezeCard, removeCardFromWallet,
  replaceCard, requestWalletCard, revealCard, unfreezeCard, updateCardControls,
  type CardControls, type CardReveal, type IssuedCard, type WalletToken,
} from "../lib/api";
import { getCurrency } from "../lib/currency";
import { queryClient } from "../lib/queryClient";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

type PinAction =
  | { kind: "reveal" } | { kind: "unfreeze" } | { kind: "replace" }
  | { kind: "controls"; changes: Partial<CardControls> } | { kind: "wallet"; wallet: WalletToken["wallet"] };

const PHONE_WALLET: WalletToken["wallet"] = Platform.OS === "ios" ? "apple_pay" : "google_pay";
const WALLET_LABEL: Record<WalletToken["wallet"], string> = {
  apple_pay: "Apple Wallet", google_pay: "Google Wallet", samsung_pay: "Samsung Wallet",
};
const DECLINE_TEXT: Record<string, string> = {
  insufficient_funds: "Not enough balance", card_frozen: "Card was frozen", international_disabled: "International payments off",
  online_disabled: "Online payments off", contactless_disabled: "Tap to pay off", atm_disabled: "ATM withdrawals off",
  card_limit_exceeded: "Above your card limit", limit_exceeded: "Above your account limit",
  merchant_category_blocked: "Merchant type blocked", wallet_restricted: "Wallet restricted", account_restricted: "Account restricted",
};

/** One wallet's Visa card: details, freeze, controls, phone wallet (tap to pay), activity. */
export default function CardScreen() {
  const router = useRouter();
  const { walletId } = useLocalSearchParams<{ walletId: string }>();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [pinAction, setPinAction] = useState<PinAction | null>(null);
  const [revealed, setRevealed] = useState<CardReveal | null>(null);

  const { data: wallets } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const wallet = (wallets || []).find((w: any) => w.id === walletId);
  const issuedId: string | undefined = wallet?.issuedCard?.id;
  const { data: card, isLoading } = useQuery({
    queryKey: ["issued-card", issuedId], queryFn: () => fetchIssuedCard(issuedId!), enabled: !!issuedId,
  });
  const { data: activity } = useQuery({
    queryKey: ["card-activity", issuedId], queryFn: () => cardAuthorizations(issuedId!), enabled: !!issuedId && card?.status !== "pending_kyc",
  });

  // Hide revealed details automatically when the issuer's session expires.
  useEffect(() => {
    if (!revealed) return;
    const ms = Math.max(5000, new Date(revealed.expiresAt).getTime() - Date.now());
    const t = setTimeout(() => setRevealed(null), ms);
    return () => clearTimeout(t);
  }, [revealed]);

  const refresh = (updated?: IssuedCard) => {
    if (updated) queryClient.setQueryData(["issued-card", updated.id], updated);
    queryClient.invalidateQueries({ queryKey: ["cards"] });
    queryClient.invalidateQueries({ queryKey: ["issued-card"] });
  };
  const fail = (e: any) => toast({ title: "Couldn't update card", description: e?.message, variant: "destructive" });

  const requestCard = useMutation({ mutationFn: () => requestWalletCard(walletId!), onSuccess: refresh, onError: fail });
  const freeze = useMutation({ mutationFn: () => freezeCard(card!.id), onSuccess: (c) => { refresh(c); toast({ title: "Card frozen", description: "No new payments will go through." }); }, onError: fail });
  const removeToken = useMutation({ mutationFn: (tokenId: string) => removeCardFromWallet(card!.id, tokenId), onSuccess: () => refresh(), onError: fail });

  const onPin = async (pin: string) => {
    if (!card || !pinAction) return;
    if (pinAction.kind === "reveal") {
      const r = await revealCard(card.id, pin);
      if (r.kind === "hosted" && r.url) await Linking.openURL(r.url);
      else setRevealed(r);
    } else if (pinAction.kind === "unfreeze") {
      refresh(await unfreezeCard(card.id, pin));
      toast({ title: "Card active", description: "Payments are allowed again." });
    } else if (pinAction.kind === "replace") {
      refresh(await replaceCard(card.id, pin));
      toast({ title: "New card issued", description: "Your old card number no longer works." });
    } else if (pinAction.kind === "controls") {
      refresh(await updateCardControls(card.id, pin, pinAction.changes));
    } else if (pinAction.kind === "wallet") {
      await addCardToWallet(card.id, pin, pinAction.wallet, Platform.OS === "ios" ? "iPhone" : "Android phone");
      // The issuer's native SDK completes provisioning on device; status
      // turns "active" once Visa confirms the token.
      refresh();
      toast({ title: `Adding to ${WALLET_LABEL[pinAction.wallet]}`, description: "You'll be able to tap to pay once it's confirmed." });
    }
    setPinAction(null);
  };

  const currency = wallet?.currency || card?.billingCurrency || "ZAR";
  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{wallet?.title || "Card"}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!wallet) {
    return <View style={[styles.container, { backgroundColor: colors.background }]}>{header}<ActivityIndicator color={colors.primary} /></View>;
  }

  if (!issuedId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        {header}
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="card-outline" size={36} color={colors.primary} />
          <Text style={[styles.panelTitle, { color: colors.text }]}>Your Visa card is on its way</Text>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            Every BukkaPay wallet gets a Visa card for online payments and tap to pay. If it hasn't appeared yet, request it now.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => requestCard.mutate()} disabled={requestCard.isPending}>
            <Text style={styles.primaryBtnText}>{requestCard.isPending ? "Requesting…" : "Get my card"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading || !card) {
    return <View style={[styles.container, { backgroundColor: colors.background }]}>{header}<ActivityIndicator color={colors.primary} /></View>;
  }

  const expiry = card.expMonth ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : "—";
  const frozen = card.status === "frozen";
  const phoneToken = card.walletTokens.find((t) => t.wallet === PHONE_WALLET && t.status !== "deleted");
  const toggle = (key: keyof CardControls, value: boolean) => setPinAction({ kind: "controls", changes: { [key]: value } });

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      {header}

      <PremiumCard
        cardNumber={revealed?.pan ? revealed.pan.replace(/(.{4})/g, "$1 ").trim() : `•••• •••• •••• ${card.last4 || "••••"}`}
        holderName={card.cardholderName}
        expiryDate={expiry}
        balance={Number(wallet.balance)}
        currency={getCurrency(currency).symbol}
      />

      {card.status === "pending_kyc" && (
        <View style={[styles.notice, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.text }]}>Verify your identity to activate this card. It's issued as soon as your ID is approved.</Text>
          <TouchableOpacity onPress={() => router.push("/(screens)/my-id" as any)}><Text style={{ color: colors.primary, fontWeight: "700" }}>Verify</Text></TouchableOpacity>
        </View>
      )}
      {Number(card.overdraftOutstanding) > 0 && (
        <View style={[styles.notice, { backgroundColor: "#FEF2F2" }]}>
          <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
          <Text style={[styles.noticeText, { color: "#7F1D1D" }]}>
            A card payment cleared for more than your balance. Top up {getCurrency(currency).symbol}{card.overdraftOutstanding} and your card resumes automatically.
          </Text>
        </View>
      )}

      {revealed && (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Card number</Text>
            <TouchableOpacity onPress={async () => { await Clipboard.setStringAsync(revealed.pan || ""); toast({ title: "Copied" }); }}>
              <Ionicons name="copy-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.mono, { color: colors.text }]}>{revealed.pan}</Text>
          <View style={[styles.row, { marginTop: 12 }]}>
            <View><Text style={[styles.label, { color: colors.textMuted }]}>Expiry</Text><Text style={[styles.value, { color: colors.text }]}>{expiry}</Text></View>
            <View><Text style={[styles.label, { color: colors.textMuted }]}>CVV</Text><Text style={[styles.value, { color: colors.text }]}>{revealed.cvv}</Text></View>
          </View>
          {revealed.kind === "sandbox" && <Text style={[styles.muted, { color: colors.textMuted, marginTop: 8 }]}>Test card (sandbox) — works only in the BukkaPay test environment.</Text>}
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>Details hide automatically in a minute.</Text>
        </View>
      )}

      {(card.status === "active" || frozen) && (
        <View style={styles.actions}>
          <Action icon="eye-outline" label="Details" onPress={() => setPinAction({ kind: "reveal" })} disabled={frozen} colors={colors} />
          <Action icon={frozen ? "play-outline" : "snow-outline"} label={frozen ? "Unfreeze" : "Freeze"}
            onPress={() => (frozen ? setPinAction({ kind: "unfreeze" }) : freeze.mutate())} colors={colors} />
          <Action icon="refresh-outline" label="Replace" onPress={() => setPinAction({ kind: "replace" })} colors={colors} />
        </View>
      )}

      {card.status === "active" && (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Tap to pay</Text>
          {phoneToken ? (
            <View style={styles.row}>
              <Text style={[styles.value, { color: colors.text }]}>
                {WALLET_LABEL[phoneToken.wallet]} · {phoneToken.status === "active" ? "ready" : "being set up"}
              </Text>
              <TouchableOpacity onPress={() => removeToken.mutate(phoneToken.id)}><Text style={{ color: "#DC2626", fontWeight: "600" }}>Remove</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                Add this card to {WALLET_LABEL[PHONE_WALLET]} and pay by holding your phone to any contactless Visa terminal, anywhere in the world.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: "#000" }]} onPress={() => setPinAction({ kind: "wallet", wallet: PHONE_WALLET })}>
                <Ionicons name={Platform.OS === "ios" ? "logo-apple" : "logo-google"} size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Add to {WALLET_LABEL[PHONE_WALLET]}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {(card.status === "active" || frozen) && (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Card controls</Text>
          {([
            ["online", "Online payments"], ["contactless", "Tap to pay (contactless)"], ["chip", "Chip & PIN"],
            ["international", "Payments abroad"], ["atm", "ATM withdrawals"],
          ] as [keyof CardControls, string][]).map(([key, label]) => (
            <View key={key} style={styles.row}>
              <Text style={[styles.value, { color: colors.text }]}>{label}</Text>
              <Switch value={Boolean(card.controls[key])} onValueChange={(v) => toggle(key, v)} trackColor={{ true: colors.primary }} />
            </View>
          ))}
          <Text style={[styles.muted, { color: colors.textMuted }]}>Changes ask for your PIN.</Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Card activity</Text>
      {(activity || []).length === 0 && <Text style={[styles.muted, { color: colors.textMuted }]}>No card payments yet.</Text>}
      {(activity || []).map((a) => (
        <View key={a.id} style={[styles.activityRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.value, { color: colors.text }]}>{a.merchantName || "Card payment"}</Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {new Date(a.createdAt).toLocaleString()} · {a.status === "declined" ? DECLINE_TEXT[a.declineReason || ""] || "Declined" : a.status === "approved" ? "Pending" : a.status}
              {a.merchantCurrency && a.merchantCurrency !== a.currency ? ` · ${a.merchantCurrency} ${a.merchantAmount}` : ""}
            </Text>
          </View>
          <Text style={[styles.value, { color: a.status === "declined" || a.status === "reversed" || a.status === "expired" ? colors.textMuted : colors.text }]}>
            -{getCurrency(a.currency).symbol}{(Number(a.amount) + Number(a.fee)).toFixed(2)}
          </Text>
        </View>
      ))}

      <PinPrompt
        visible={pinAction !== null}
        title="Confirm PIN"
        subtitle={pinAction?.kind === "reveal" ? "Enter your PIN to see your card details." : "Enter your PIN to continue."}
        onCancel={() => setPinAction(null)}
        onSubmit={onPin}
      />
    </ScrollView>
  );
}

function Action({ icon, label, onPress, disabled, colors }: { icon: any; label: string; onPress: () => void; disabled?: boolean; colors: any }) {
  return (
    <TouchableOpacity style={[styles.action, { opacity: disabled ? 0.4 : 1 }]} onPress={onPress} disabled={disabled}>
      <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 80, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 8 },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  panel: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { flexDirection: "row", gap: 8, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: "600" },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 18, letterSpacing: 1.5, fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "space-around" },
  action: { alignItems: "center", gap: 6 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 12, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  activityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
});
