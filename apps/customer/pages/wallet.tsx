/**
 * Cards: your one Visa card (virtual, physical later). It spends from the
 * wallet you choose under "Spends from"; tap the card to pay, freeze or
 * manage it.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import WalletCard from "../components/WalletCard";
import AddCardDialog from "../components/AddCardDialog";
import PinPrompt from "../components/PinPrompt";
import { fetchCards, fetchIssuedCards, requestWalletCard, setCardWallet, type IssuedCard } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import { activeToken, pendingToken, WALLET_NAME } from "../lib/tapToPay";

const SHOWN = new Set(["active", "frozen", "pending_kyc", "requested"]);
const DEFAULT_BY_COUNTRY: Record<string, string> = { ZA: "ZAR", BW: "BWP", ZW: "USD" };

export default function Cards() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [switchTo, setSwitchTo] = useState<any>(null);
  useEffect(() => { getCurrentUser().then(setUser).catch(() => {}); }, []);

  const issued = useQuery({ queryKey: ["issued-cards"], queryFn: fetchIssuedCards });
  const wallets = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const list: any[] = wallets.data || [];
  const card = (issued.data || []).find((c) => SHOWN.has(c.status));
  const active = list.find((w) => w.id === card?.walletCardId);
  const preferred = useMemo(() => {
    const want = DEFAULT_BY_COUNTRY[(user?.countryCode || user?.residenceCountry || "").toUpperCase()];
    return list.find((w) => w.currency === want) || list.find((w) => w.isDefault) || list[0];
  }, [list, user]);

  const refresh = () => { issued.refetch(); wallets.refetch(); };
  const request = useMutation({
    mutationFn: (walletId: string) => requestWalletCard(walletId),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["issued-cards"] });
      toast({ title: c.status === "pending_kyc" ? "Card reserved" : "Your Visa card is ready",
              description: c.status === "pending_kyc" ? "Verify your ID to activate it." : "Tap it to add it to your phone." });
    },
    onError: (e: any) => toast({ title: "Couldn't get a card", description: e?.message, variant: "destructive" }),
  });

  const doSwitch = async (pin: string) => {
    try {
      await setCardWallet(card!.id, switchTo.id, pin);
      qc.invalidateQueries({ queryKey: ["issued-cards"] });
      toast({ title: `Card now spends from ${switchTo.title}`,
              description: switchTo.currency === card!.billingCurrency ? "No conversion needed." : `Payments in ${card!.billingCurrency} convert from ${switchTo.currency} at our rate.` });
    } catch (e: any) {
      toast({ title: "Couldn't switch wallet", description: e?.message, variant: "destructive" });
    } finally {
      setSwitchTo(null);
    }
  };

  const loading = issued.isLoading || wallets.isLoading;

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content}
      refreshControl={<RefreshControl refreshing={issued.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={st.header}>
        <Text style={[st.title, { color: colors.text }]}>Card</Text>
        <Text style={[st.subtitle, { color: colors.textSecondary }]}>One Visa card for all your wallets</Text>
      </View>

      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      {!loading && issued.error && (
        <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.panelTitle, { color: colors.text }]}>Couldn't load your card</Text>
          <Text style={[st.muted, { color: colors.textMuted }]}>{(issued.error as Error).message}</Text>
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={refresh}><Text style={st.btnText}>Try again</Text></TouchableOpacity>
        </View>
      )}

      {!loading && card && (
        <>
          <CardTile card={card} wallet={active} holder={user?.name ?? null} colors={colors}
            onOpen={() => router.push({ pathname: "/(screens)/card", params: { walletId: card.walletCardId } } as any)} />

          <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={st.rowBetween}>
              <Text style={[st.panelTitle, { color: colors.text }]}>Spends from</Text>
              <Text style={[st.muted, { color: colors.textMuted }]}>Billed in {card.billingCurrency}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {list.map((w) => {
                const on = w.id === card.walletCardId;
                return (
                  <TouchableOpacity key={w.id} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    disabled={on || !SHOWN.has(card.status)} onPress={() => setSwitchTo(w)}
                    style={[st.walletChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.background }]}>
                    <View style={st.rowBetween}>
                      <Text style={[st.chipCcy, { color: on ? colors.primary : colors.textMuted }]}>{w.currency}</Text>
                      {on && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                    </View>
                    <Text style={[st.chipTitle, { color: colors.text }]} numberOfLines={1}>{w.title}</Text>
                    <Text style={[st.chipBal, { color: colors.text }]}>{getCurrency(w.currency).symbol}{Number(w.balance).toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[st.muted, { color: colors.textMuted }]}>
              {active && active.currency !== card.billingCurrency
                ? `Card payments convert ${card.billingCurrency} → ${active.currency} at our rate, shown on every payment.`
                : "Tap another wallet to pay from it. You'll confirm with your PIN."}
            </Text>
          </View>
        </>
      )}

      {!loading && !issued.error && !card && (
        <View style={[st.empty, { borderColor: colors.border }]}>
          <View style={[st.emptyIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="card-outline" size={30} color={colors.primary} /></View>
          <Text style={[st.panelTitle, { color: colors.text }]}>Get your free Visa card</Text>
          <Text style={[st.muted, { color: colors.textMuted, textAlign: "center" }]}>Shop online and tap to pay with your phone, from any of your wallets.</Text>
          {preferred && (
            <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary, alignSelf: "stretch" }]} disabled={request.isPending}
              onPress={() => request.mutate(preferred.id)}>
              <Text style={st.btnText}>{request.isPending ? "Getting your card…" : "Get my Visa card"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!loading && <AddCardDialog />}
      <PinPrompt visible={!!switchTo} title="Switch card wallet"
        subtitle={switchTo ? `Pay with ${switchTo.title} (${switchTo.currency})` : undefined}
        onCancel={() => setSwitchTo(null)} onSubmit={doSwitch} />
    </ScrollView>
  );
}

function CardTile({ card, wallet, holder, colors, onOpen }: { card: IssuedCard; wallet: any; holder: string | null; colors: any; onOpen: () => void }) {
  const expiry = card.expMonth ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : null;
  const ready = activeToken(card);
  const settingUp = pendingToken(card);
  const status = card.status === "frozen" && card.frozenReason === "no_funds" ? { icon: "wallet-outline", text: "Paused · top up to use", color: "#B45309" }
    : card.status === "frozen" ? { icon: "snow-outline", text: "Frozen · tap to manage", color: "#2563EB" }
    : card.status === "pending_kyc" ? { icon: "shield-outline", text: "Verify your ID to activate", color: "#D97706" }
    : card.status === "requested" ? { icon: "time-outline", text: "Being issued…", color: "#6B7280" }
    : !card.controls.online && !card.controls.contactless ? { icon: "pause-circle-outline", text: "Online and tap to pay off", color: "#B45309" }
    : !card.controls.online ? { icon: "pause-circle-outline", text: "Online payments off", color: "#B45309" }
    : ready ? { icon: "phone-portrait-outline", text: `Tap to pay ready · ${WALLET_NAME[ready.wallet]}`, color: "#059669" }
    : settingUp ? { icon: "sync-outline", text: "Adding to your phone…", color: colors.primary }
    : { icon: "add-circle-outline", text: "Add to your phone for tap to pay", color: colors.primary };

  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.9} style={st.tile} accessibilityRole="button" accessibilityLabel={`Open card ending ${card.last4 ?? ""}`}>
      <WalletCard
        title={wallet?.title || `${card.billingCurrency} Visa`}
        balance={Number(wallet?.balance ?? 0)}
        currency={getCurrency(wallet?.currency || card.billingCurrency).symbol}
        cardNumber={card.last4 ? `•••• •••• •••• ${card.last4}` : ""}
        expiryDate={expiry}
        holderName={card.cardholderName || holder}
        cardStatus={card.status === "frozen" && card.frozenReason === "no_funds" ? "no_funds" : card.status}
      />
      <View style={st.tileMeta}>
        <View style={[st.badge, { backgroundColor: card.form === "physical" ? "#111827" : colors.primaryLight }]}>
          <Ionicons name={card.form === "physical" ? "card" : "cloud-outline"} size={11} color={card.form === "physical" ? "#fff" : colors.primary} />
          <Text style={[st.badgeText, { color: card.form === "physical" ? "#fff" : colors.primary }]}>{card.form === "physical" ? "PHYSICAL" : "VIRTUAL"}</Text>
        </View>
        <View style={st.statusRow}>
          <Ionicons name={status.icon as any} size={14} color={status.color} />
          <Text style={[st.statusText, { color: status.color }]} numberOfLines={1}>{status.text}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 18 },
  header: { paddingTop: Platform.OS === "ios" ? 56 : 44 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 2 },
  tile: { gap: 10 },
  tileMeta: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  statusRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  panel: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 18 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  walletChip: { width: 140, borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 2 },
  chipCcy: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chipTitle: { fontSize: 14, fontWeight: "600" },
  chipBal: { fontSize: 15, fontWeight: "800", marginTop: 4 },
  btn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 32, borderWidth: 1, borderStyle: "dashed", borderRadius: 18, paddingHorizontal: 24 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
