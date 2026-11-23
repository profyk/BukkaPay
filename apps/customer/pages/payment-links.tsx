/**
 * My payment links: what I'm collecting (per currency — never added across
 * currencies) and links I've saved to pay. Share by WhatsApp, copy, cancel.
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import {
  canDelete, confirmAction, fetchPaymentLinks, isOpen, linkUrl, money, removeLink, shareLink, shareWhatsApp,
  unsaveLink, type PaymentLink,
} from "../lib/paymentLinks";

const STATUS: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Waiting", color: "#D97706", icon: "time-outline" },
  partial: { label: "Part paid", color: "#2563EB", icon: "pie-chart-outline" },
  paid: { label: "Paid", color: "#059669", icon: "checkmark-circle" },
  expired: { label: "Expired", color: "#6B7280", icon: "hourglass-outline" },
  cancelled: { label: "Cancelled", color: "#9CA3AF", icon: "close-circle-outline" },
};
const FILTERS = [
  { key: "open", label: "Open" }, { key: "paid", label: "Paid" }, { key: "closed", label: "Closed" }, { key: "all", label: "All" },
] as const;

type Tab = "sent" | "received";

export default function PaymentLinks() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("sent");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: links = [], isLoading, error, refetch, isRefetching } = useQuery({ queryKey: ["payment-links"], queryFn: fetchPaymentLinks });

  const sent = links.filter((l) => l.direction !== "received");
  const received = links.filter((l) => l.direction === "received");

  // Totals per currency: collected so far and still outstanding on open links.
  const totals = useMemo(() => {
    const by: Record<string, { collected: number; outstanding: number; open: number }> = {};
    for (const l of sent) {
      const t = (by[l.currency] ??= { collected: 0, outstanding: 0, open: 0 });
      t.collected += Number(l.amountPaid || 0);
      if (isOpen(l)) { t.open += 1; t.outstanding += Number(l.remainingBalance ?? l.amount) || 0; }
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [links]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tab === "sent" ? sent : received)
      .filter((l) => tab === "received" || filter === "all"
        || (filter === "open" && isOpen(l)) || (filter === "paid" && l.status === "paid")
        || (filter === "closed" && (l.status === "cancelled" || l.status === "expired")))
      .filter((l) => !q || (l.description || "").toLowerCase().includes(q) || l.currency.toLowerCase().includes(q) || l.amount.includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [links, tab, filter, search]);

  const copy = async (l: PaymentLink) => { await Clipboard.setStringAsync(linkUrl(l)); toast({ title: "Link copied" }); };
  const remove = (l: PaymentLink) => {
    const del = canDelete(l);
    confirmAction(
      del ? "Delete this link?" : "Cancel this link?",
      del ? "Nobody has paid it yet, so it will be removed." : `It has already received ${money(l.amountPaid, l.currency)}. Cancelling stops new payments; that money and the history are kept.`,
      del ? "Delete" : "Cancel link",
      async () => {
        setBusy(l.id);
        try { const r = await removeLink(l); toast({ title: r === "deleted" ? "Link deleted" : "Link cancelled" }); qc.invalidateQueries({ queryKey: ["payment-links"] }); }
        catch (e: any) { toast({ title: "Couldn't update the link", description: e.message, variant: "destructive" }); }
        finally { setBusy(null); }
      },
    );
  };
  const unsave = async (l: PaymentLink) => {
    setBusy(l.id);
    try { await unsaveLink(l.id); qc.invalidateQueries({ queryKey: ["payment-links"] }); }
    catch (e: any) { toast({ title: "Couldn't remove it", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const create = () => router.push("/(screens)/create-payment-link" as any);

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.topBar, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.text }]}>Payment links</Text>
        <TouchableOpacity style={[st.newBtn, { backgroundColor: colors.primary }]} onPress={create} accessibilityLabel="New payment link">
          <Ionicons name="add" size={18} color="#fff" /><Text style={st.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.body} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}>
        {/* Collecting vs to pay */}
        <View style={[st.segment, { backgroundColor: colors.surface }]}>
          {([["sent", "I'm collecting", sent.length], ["received", "To pay", received.filter(isOpen).length]] as const).map(([k, label, n]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.segBtn, tab === k && { backgroundColor: colors.card }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[st.segText, { color: tab === k ? colors.text : colors.textMuted }]}>{label}{n ? ` · ${n}` : ""}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "sent" && totals.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {totals.map(([ccy, t]) => (
              <View key={ccy} style={[st.summary, { backgroundColor: "#001A72" }]}>
                <Text style={st.summaryCcy}>{ccy}</Text>
                <Text style={st.summaryBig}>{money(t.collected, ccy)}</Text>
                <Text style={st.summarySub}>collected</Text>
                <View style={st.summaryRow}>
                  <View><Text style={st.summaryVal}>{money(t.outstanding, ccy)}</Text><Text style={st.summarySub}>still owed</Text></View>
                  <View><Text style={st.summaryVal}>{t.open}</Text><Text style={st.summarySub}>open links</Text></View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={[st.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search by what it's for, amount or currency"
            placeholderTextColor={colors.textMuted} style={[st.searchInput, { color: colors.text }]} accessibilityLabel="Search payment links" />
          {!!search && <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>}
        </View>

        {tab === "sent" && (
          <View style={st.filters}>
            {FILTERS.map((f) => (
              <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)}
                style={[st.chip, { borderColor: colors.border, backgroundColor: colors.card }, filter === f.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={[st.chipText, { color: filter === f.key ? "#fff" : colors.textSecondary }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          : error ? (
            <View style={st.empty}>
              <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
              <Text style={[st.emptyTitle, { color: colors.text }]}>Couldn't load your links</Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>{(error as Error).message}</Text>
              <TouchableOpacity style={[st.cta, { backgroundColor: colors.primary }]} onPress={() => refetch()}><Text style={st.ctaText}>Try again</Text></TouchableOpacity>
            </View>
          ) : shown.length === 0 ? (
            <View style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="link-outline" size={30} color={colors.primary} /></View>
              <Text style={[st.emptyTitle, { color: colors.text }]}>
                {search ? "Nothing matches" : tab === "received" ? "Nothing to pay" : filter === "open" ? "No open links" : "No links here"}
              </Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>
                {tab === "received" ? "Payment links people send you appear here once you open them."
                  : "Create a link, send it on WhatsApp, and see it marked paid the moment the money arrives."}
              </Text>
              {tab === "sent" && !search && <TouchableOpacity style={[st.cta, { backgroundColor: colors.primary }]} onPress={create}><Text style={st.ctaText}>Create a payment link</Text></TouchableOpacity>}
            </View>
          ) : shown.map((l) => (
            <LinkRow key={l.id} link={l} busy={busy === l.id} colors={colors}
              onOpen={() => router.push(`/(screens)/payment-link-detail?id=${l.id}` as any)}
              onPay={() => router.push(`/pay/${l.id}` as any)}
              onWhatsApp={() => shareWhatsApp(l)} onShare={() => shareLink(l)} onCopy={() => copy(l)}
              onRemove={() => (l.direction === "received" ? unsave(l) : remove(l))} />
          ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function LinkRow({ link: l, busy, colors, onOpen, onPay, onWhatsApp, onShare, onCopy, onRemove }: {
  link: PaymentLink; busy: boolean; colors: any;
  onOpen: () => void; onPay: () => void; onWhatsApp: () => void; onShare: () => void; onCopy: () => void; onRemove: () => void;
}) {
  const s = STATUS[l.status] ?? STATUS.pending;
  const paid = Number(l.amountPaid || 0), total = Number(l.amount || 0);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const received = l.direction === "received";
  const open = isOpen(l);
  const date = new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const expires = l.expiresAt && open ? ` · expires ${new Date(l.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "";

  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.85} style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }, busy && { opacity: 0.5 }]}>
      <View style={st.rowTop}>
        <View style={[st.rowIcon, { backgroundColor: s.color + "18" }]}><Ionicons name={received ? "arrow-down-circle-outline" : s.icon} size={22} color={s.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[st.rowTitle, { color: colors.text }]} numberOfLines={1}>{l.description || "Payment request"}</Text>
          <Text style={[st.rowMeta, { color: colors.textMuted }]}>{date}{expires}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={[st.rowAmount, { color: colors.text }]}>{money(l.amount, l.currency)}</Text>
          <View style={[st.pill, { backgroundColor: s.color + "18" }]}><Text style={[st.pillText, { color: s.color }]}>{s.label}</Text></View>
        </View>
      </View>

      {paid > 0 && l.status !== "paid" && (
        <View style={st.progressRow}>
          <View style={[st.track, { backgroundColor: colors.border }]}><View style={[st.fill, { width: `${pct}%` as any, backgroundColor: s.color }]} /></View>
          <Text style={[st.rowMeta, { color: colors.textMuted }]}>{money(paid, l.currency)} of {money(total, l.currency)}</Text>
        </View>
      )}

      <View style={[st.actions, { borderColor: colors.border }]}>
        {received ? (
          <>
            {open && <Act icon="wallet-outline" label="Pay now" onPress={onPay} solid="#059669" />}
            <Act icon="close-outline" label="Remove" onPress={onRemove} color={colors.textMuted} disabled={busy} />
          </>
        ) : (
          <>
            {open && <Act icon="logo-whatsapp" label="WhatsApp" onPress={onWhatsApp} solid="#25D366" />}
            {open && <Act icon={Platform.OS === "ios" ? "share-outline" : "share-social-outline"} label="Share" onPress={onShare} color={colors.primary} />}
            <Act icon="copy-outline" label="Copy" onPress={onCopy} color={colors.textSecondary} />
            {open && <Act icon={canDelete(l) ? "trash-outline" : "close-circle-outline"} label={canDelete(l) ? "Delete" : "Cancel"} onPress={onRemove} color="#DC2626" disabled={busy} />}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

function Act({ icon, label, onPress, color, solid, disabled }: { icon: any; label: string; onPress: () => void; color?: string; solid?: string; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={[st.act, solid ? { backgroundColor: solid, borderColor: solid } : { borderColor: "rgba(0,0,0,0.08)" }]}>
      <Ionicons name={icon} size={15} color={solid ? "#fff" : color} />
      <Text style={[st.actText, { color: solid ? "#fff" : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 52 : 40, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  body: { padding: 16, gap: 12 },
  segment: { flexDirection: "row", borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 11 },
  segText: { fontWeight: "700", fontSize: 13 },
  summary: { width: 250, borderRadius: 20, padding: 18 },
  summaryCcy: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  summaryBig: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 4 },
  summarySub: { color: "rgba(255,255,255,0.55)", fontSize: 11 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  summaryVal: { color: "#fff", fontSize: 15, fontWeight: "700" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 8 },
  searchInput: { flex: 1, fontSize: 14 },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  cta: { marginTop: 8, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  ctaText: { color: "#fff", fontWeight: "700" },
  row: { borderRadius: 18, borderWidth: 1, padding: 14 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: "800" },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: "800" },
  progressRow: { marginTop: 10, gap: 4 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  actions: { flexDirection: "row", gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  act: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actText: { fontSize: 11, fontWeight: "700" },
});
