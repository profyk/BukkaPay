/**
 * Cards: only issued Visa cards, virtual and physical. Tap one to open it:
 * details, freeze, controls and tap to pay at any card machine.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import WalletCard from "../components/WalletCard";
import AddCardDialog from "../components/AddCardDialog";
import { fetchCards, fetchIssuedCards, requestWalletCard, type IssuedCard } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import { activeToken, pendingToken, WALLET_NAME } from "../lib/tapToPay";

const SHOWN = new Set(["active", "frozen", "pending_kyc", "requested"]);

export default function Cards() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [holder, setHolder] = useState<string | null>(null);
  useEffect(() => { getCurrentUser().then((u) => u && setHolder(u.name)).catch(() => {}); }, []);

  const issued = useQuery({ queryKey: ["issued-cards"], queryFn: fetchIssuedCards });
  const wallets = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const byWallet = useMemo(() => Object.fromEntries((wallets.data || []).map((w: any) => [w.id, w])), [wallets.data]);

  const cards = (issued.data || [])
    .filter((c) => SHOWN.has(c.status))
    .sort((a, b) => (a.form === b.form ? a.createdAt.localeCompare(b.createdAt) : a.form === "virtual" ? -1 : 1));
  // Wallets that don't have a live card yet can request one.
  const withoutCard = (wallets.data || []).filter((w: any) => !cards.some((c) => c.walletCardId === w.id));

  const request = useMutation({
    mutationFn: (walletId: string) => requestWalletCard(walletId),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["issued-cards"] }); qc.invalidateQueries({ queryKey: ["cards"] });
      toast({ title: c.status === "pending_kyc" ? "Card reserved" : "Your Visa card is ready", description: c.status === "pending_kyc" ? "Verify your ID to activate it." : "Tap it to add it to your phone." });
    },
    onError: (e: any) => toast({ title: "Couldn't get a card", description: e?.message, variant: "destructive" }),
  });

  const loading = issued.isLoading || wallets.isLoading;
  const refresh = () => { issued.refetch(); wallets.refetch(); };

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content}
      refreshControl={<RefreshControl refreshing={issued.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={st.header}>
        <Text style={[st.title, { color: colors.text }]}>Cards</Text>
        <Text style={[st.subtitle, { color: colors.textSecondary }]}>Your Visa cards · tap one to pay, freeze or manage it</Text>
      </View>

      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

      {!loading && issued.error && (
        <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.panelTitle, { color: colors.text }]}>Couldn't load your cards</Text>
          <Text style={[st.muted, { color: colors.textMuted }]}>{(issued.error as Error).message}</Text>
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={refresh}><Text style={st.btnText}>Try again</Text></TouchableOpacity>
        </View>
      )}

      {cards.map((c) => <CardTile key={c.id} card={c} wallet={byWallet[c.walletCardId]} holder={holder} colors={colors}
        onOpen={() => router.push({ pathname: "/(screens)/card", params: { walletId: c.walletCardId } } as any)} />)}

      {!loading && !issued.error && cards.length === 0 && (
        <View style={[st.empty, { borderColor: colors.border }]}>
          <View style={[st.emptyIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="card-outline" size={30} color={colors.primary} /></View>
          <Text style={[st.panelTitle, { color: colors.text }]}>No cards yet</Text>
          <Text style={[st.muted, { color: colors.textMuted, textAlign: "center" }]}>Get a free virtual Visa card for any wallet. Shop online and tap to pay with your phone.</Text>
        </View>
      )}

      {!loading && withoutCard.length > 0 && (
        <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.panelTitle, { color: colors.text }]}>Get a Visa card</Text>
          {withoutCard.map((w: any) => (
            <View key={w.id} style={st.walletRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.walletName, { color: colors.text }]}>{w.title}</Text>
                <Text style={[st.muted, { color: colors.textMuted }]}>{w.currency} · {getCurrency(w.currency).symbol}{Number(w.balance).toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={[st.smallBtn, { backgroundColor: colors.primary }]} disabled={request.isPending} onPress={() => request.mutate(w.id)}>
                <Text style={st.btnText}>{request.isPending && request.variables === w.id ? "…" : "Get card"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {!loading && <AddCardDialog />}
    </ScrollView>
  );
}

function CardTile({ card, wallet, holder, colors, onOpen }: { card: IssuedCard; wallet: any; holder: string | null; colors: any; onOpen: () => void }) {
  const expiry = card.expMonth ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : null;
  const ready = activeToken(card);
  const settingUp = pendingToken(card);
  const status = card.status === "frozen" ? { icon: "snow-outline", text: "Frozen · tap to manage", color: "#2563EB" }
    : card.status === "pending_kyc" ? { icon: "shield-outline", text: "Verify your ID to activate", color: "#D97706" }
    : card.status === "requested" ? { icon: "time-outline", text: "Being issued…", color: "#6B7280" }
    : !card.controls.online && !card.controls.contactless ? { icon: "pause-circle-outline", text: "Online and tap to pay off", color: "#B45309" }
    : !card.controls.online ? { icon: "pause-circle-outline", text: "Online payments off", color: "#B45309" }
    : ready ? { icon: "phone-portrait-outline", text: `Tap to pay ready · ${WALLET_NAME[ready.wallet]}`, color: "#059669" }
    : settingUp ? { icon: "sync-outline", text: "Adding to your phone…", color: colors.primary }
    : card.form === "physical" ? { icon: "wifi", text: card.controls.contactless ? "Contactless on" : "Contactless off", color: colors.textMuted }
    : { icon: "add-circle-outline", text: "Add to your phone for tap to pay", color: colors.primary };

  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.9} style={st.tile} accessibilityRole="button" accessibilityLabel={`Open ${card.form} card ending ${card.last4 ?? ""}`}>
      <WalletCard
        title={wallet?.title || `${card.billingCurrency} Visa`}
        balance={Number(wallet?.balance ?? 0)}
        currency={getCurrency(wallet?.currency || card.billingCurrency).symbol}
        cardNumber={card.last4 ? `•••• •••• •••• ${card.last4}` : ""}
        expiryDate={expiry}
        holderName={card.cardholderName || holder}
        cardStatus={card.status}
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
  panel: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  smallBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { color: "#fff", fontWeight: "700" },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  walletName: { fontSize: 15, fontWeight: "600" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 32, borderWidth: 1, borderStyle: "dashed", borderRadius: 18, paddingHorizontal: 24 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
