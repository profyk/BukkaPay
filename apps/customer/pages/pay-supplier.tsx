/**
 * Pay Supplier: open a supplier's trade invoice (from a link, QR or its
 * reference), pay it instantly or with Protected Escrow Pay, and keep the
 * border-ready receipt. Also lists your escrows.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCards } from "../lib/api";
import { fetchEscrows, fetchInvoice, newIdempotencyKey, payInvoice, shareReceipt, type TradeInvoice } from "../lib/trade";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import PinPrompt from "../components/PinPrompt";

const PRIMARY = "#7C3AED";
const STATUS_COLOR: Record<string, string> = { funded: "#D97706", released: "#059669", refunded: "#6B7280", disputed: "#DC2626" };

export default function PaySupplier() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ ref?: string }>();
  const [ref, setRef] = useState(String(params.ref ?? "").toUpperCase());
  const [invoice, setInvoice] = useState<TradeInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"instant" | "escrow">("escrow");
  const [cardId, setCardId] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey());
  const [done, setDone] = useState<{ receipt?: string; escrowRef?: string } | null>(null);

  const { data: cards = [] } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const { data: escrows = [], refetch } = useQuery({ queryKey: ["escrows"], queryFn: fetchEscrows });

  const open = async (r = ref) => {
    if (!r.trim()) return;
    setLoading(true); setDone(null);
    try {
      const inv = await fetchInvoice(r);
      setInvoice(inv);
      setMode(inv.paymentMode === "instant" ? "instant" : "escrow");
      setKey(newIdempotencyKey());
    } catch (e: any) {
      toast({ title: "Invoice not found", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };
  useEffect(() => { if (params.ref) open(String(params.ref)); }, [params.ref]);

  // Prefer a wallet in the invoice currency; other currencies are converted at the live rate.
  const wallets = cards as any[];
  useEffect(() => {
    if (!invoice || !wallets.length) return;
    const same = wallets.find((c) => c.currency === invoice.currency);
    setCardId((same ?? wallets[0]).id);
  }, [invoice, cards]);
  const card = useMemo(() => wallets.find((c) => c.id === cardId), [cardId, cards]);

  const pay = async (pin: string) => {
    if (!invoice || !card) return;
    const res = await payInvoice(invoice.reference, { fromCardId: card.id, pin, mode }, key);
    setPinOpen(false);
    qc.invalidateQueries({ queryKey: ["cards"] });
    refetch();
    setDone(res.mode === "instant" ? { receipt: res.receipt } : { escrowRef: res.escrow?.reference, receipt: res.receipts?.[0]?.number });
  };

  const sym = invoice ? getCurrency(invoice.currency).symbol : "";
  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Pay supplier</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        {!invoice && (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.title, { color: colors.text }]}>Open a supplier invoice</Text>
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>Tap the supplier's payment link, scan their invoice QR, or enter the reference.</Text>
            <TextInput value={ref} onChangeText={(t) => setRef(t.toUpperCase())} placeholder="TINV-XXXXXXXX" autoCapitalize="characters"
              placeholderTextColor={colors.textMuted} style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Invoice reference" />
            <TouchableOpacity style={st.primary} onPress={() => open()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryText}>Open invoice</Text>}
            </TouchableOpacity>
          </View>
        )}

        {invoice && !done && (
          <>
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.row}>
                <Text style={[st.title, { color: colors.text, flex: 1 }]}>{invoice.seller?.name}</Text>
                {invoice.seller?.verified && <Text style={st.verified}>✓ Verified</Text>}
              </View>
              <Text style={{ color: colors.textMuted }}>{invoice.reference} · {invoice.sellerCountry}{invoice.incoterm ? ` · ${invoice.incoterm}` : ""}</Text>
              {invoice.items?.map((it) => (
                <View key={it.lineNo} style={[st.item, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>{it.description}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{it.quantity} {it.unit ?? ""} × {sym}{it.unitPrice}{it.hsCode ? ` · HS ${it.hsCode}` : ""}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>{sym}{it.lineTotal}</Text>
                </View>
              ))}
              <View style={[st.row, { marginTop: 10 }]}>
                <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>Total</Text>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{sym}{invoice.total}</Text>
              </View>
              {invoice.status !== "issued" && <Text style={{ color: "#DC2626", marginTop: 8 }}>This invoice is {invoice.status.replace("_", " ")} and can't be paid.</Text>}
            </View>

            {invoice.status === "issued" && (
              <>
                <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[st.label, { color: colors.textMuted }]}>How to pay</Text>
                  {(["escrow", "instant"] as const).filter((m) => invoice.paymentMode === "either" || invoice.paymentMode === m).map((m) => (
                    <TouchableOpacity key={m} onPress={() => setMode(m)} style={[st.option, { borderColor: mode === m ? PRIMARY : colors.border }]}>
                      <Ionicons name={m === "escrow" ? "shield-checkmark" : "flash"} size={22} color={mode === m ? PRIMARY : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{m === "escrow" ? "Protected Escrow Pay" : "Instant Pay"}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{m === "escrow"
                          ? "BukkaPay holds the money until you confirm you have the goods. Small escrow fee paid by the supplier."
                          : "The supplier is paid straight away."}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[st.label, { color: colors.textMuted }]}>Pay from</Text>
                  {wallets.map((c) => (
                    <TouchableOpacity key={c.id} onPress={() => setCardId(c.id)} style={[st.option, { borderColor: cardId === c.id ? PRIMARY : colors.border }]}>
                      <Text style={{ color: colors.text, flex: 1, fontWeight: "600" }}>{c.currency} wallet</Text>
                      <Text style={{ color: colors.textMuted }}>{getCurrency(c.currency).symbol}{Number(c.balance).toFixed(2)}</Text>
                    </TouchableOpacity>
                  ))}
                  {card && card.currency !== invoice.currency && (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>We'll convert from {card.currency} at the live rate; you'll see the exact amount on your receipt.</Text>
                  )}
                </View>
                <TouchableOpacity style={[st.primary, !card && { opacity: 0.5 }]} disabled={!card} onPress={() => setPinOpen(true)}>
                  <Ionicons name="lock-closed" size={18} color="#fff" />
                  <Text style={st.primaryText}>{mode === "escrow" ? "Pay into escrow" : "Pay now"} · {sym}{invoice.total}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => { setInvoice(null); setRef(""); }}><Text style={st.link}>Open a different invoice</Text></TouchableOpacity>
          </>
        )}

        {done && (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <Ionicons name={done.escrowRef ? "shield-checkmark" : "checkmark-circle"} size={56} color="#10B981" />
            <Text style={[st.title, { color: colors.text, marginTop: 8 }]}>{done.escrowRef ? "Money held in escrow" : "Supplier paid"}</Text>
            <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 4 }}>{done.escrowRef
              ? "When you've got your goods, confirm in My escrows and the supplier is paid."
              : "Keep your receipt for the border post."}</Text>
            {done.receipt && (
              <TouchableOpacity style={[st.primary, { alignSelf: "stretch", marginTop: 14 }]} onPress={() => shareReceipt(done.receipt!).catch((e) => toast({ title: e.message, variant: "destructive" }))}>
                <Ionicons name="document-text" size={18} color="#fff" /><Text style={st.primaryText}>Download receipt</Text>
              </TouchableOpacity>
            )}
            {done.escrowRef && (
              <TouchableOpacity onPress={() => router.push({ pathname: "/(screens)/escrow-detail", params: { ref: done.escrowRef } } as any)}>
                <Text style={st.link}>View escrow</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={[st.section, { color: colors.text }]}>My escrows</Text>
        {escrows.length === 0 && <Text style={{ color: colors.textMuted }}>No escrows yet.</Text>}
        {escrows.map((e) => (
          <TouchableOpacity key={e.reference} onPress={() => router.push({ pathname: "/(screens)/escrow-detail", params: { ref: e.reference } } as any)}
            style={[st.card, st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{getCurrency(e.currency).symbol}{e.amount}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{e.reference}</Text>
            </View>
            <Text style={{ color: STATUS_COLOR[e.status] ?? colors.textMuted, fontWeight: "700", textTransform: "capitalize" }}>{e.status}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <PinPrompt visible={pinOpen} title="Confirm payment" onCancel={() => setPinOpen(false)} onSubmit={pay} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  verified: { color: "#059669", fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginVertical: 12, letterSpacing: 1 },
  item: { flexDirection: "row", gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  option: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8 },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { color: PRIMARY, fontWeight: "600", textAlign: "center", marginTop: 8 },
  section: { fontSize: 16, fontWeight: "700", marginTop: 8 },
});
