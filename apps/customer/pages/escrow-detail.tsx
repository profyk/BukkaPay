/** One escrow: confirm the goods arrived, open a dispute, download receipts. */
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { confirmGoods, disputeEscrow, fetchEscrow, shareReceipt } from "../lib/trade";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import PinPrompt from "../components/PinPrompt";

const PRIMARY = "#7C3AED";
const EVENT_LABEL: Record<string, string> = {
  funded: "You paid into escrow", buyer_confirmed: "You confirmed the goods", delivery_verified: "Delivery verified",
  released: "Released to the supplier", disputed: "Dispute opened", resolved_release: "Trade desk paid the supplier",
  resolved_refund: "Trade desk refunded you", refunded: "Refunded", auto_released: "Released automatically",
};

export default function EscrowDetail() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const { data: e, isLoading, refetch } = useQuery({ queryKey: ["escrow", ref], queryFn: () => fetchEscrow(String(ref)), enabled: !!ref });
  const [pinOpen, setPinOpen] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const after = () => { refetch(); qc.invalidateQueries({ queryKey: ["escrows"] }); };
  const confirm = async (pin: string) => { await confirmGoods(String(ref), pin); setPinOpen(false); after(); toast({ title: "Supplier paid" }); };
  const dispute = async () => {
    setBusy(true);
    try { await disputeEscrow(String(ref), reason); setDisputing(false); after(); toast({ title: "Dispute opened", description: "BukkaPay's trade desk will be in touch." }); }
    catch (err: any) { toast({ title: "Couldn't open dispute", description: err.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Escrow</Text>
        <View style={{ width: 40 }} />
      </View>
      {isLoading || !e ? <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={st.body}>
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted }}>{e.reference}</Text>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", marginTop: 4 }}>{getCurrency(e.currency).symbol}{e.amount}</Text>
            <Text style={{ color: colors.textMuted, textTransform: "capitalize", marginTop: 2 }}>{e.status}</Text>
            {e.paidFrom && <Text style={{ color: colors.textMuted, marginTop: 6 }}>Paid {getCurrency(e.paidFrom.currency).symbol}{e.paidFrom.amount} from your {e.paidFrom.currency} wallet</Text>}
            {e.status === "funded" && e.autoReleaseAt && (
              <Text style={{ color: colors.textMuted, marginTop: 6 }}>If you don't confirm or dispute, it's released to the supplier on {format(new Date(e.autoReleaseAt), "d MMM yyyy")}.</Text>
            )}
            {e.disputeReason && <Text style={{ color: "#DC2626", marginTop: 6 }}>Dispute: {e.disputeReason}</Text>}
            {e.resolutionNote && <Text style={{ color: colors.text, marginTop: 6 }}>Resolution: {e.resolutionNote}</Text>}
          </View>

          {e.status === "funded" && !disputing && (
            <>
              <TouchableOpacity style={st.primary} onPress={() => setPinOpen(true)}>
                <Ionicons name="checkmark-done" size={18} color="#fff" /><Text style={st.primaryText}>I've received my goods — pay the supplier</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDisputing(true)}><Text style={[st.link, { color: "#DC2626" }]}>There's a problem</Text></TouchableOpacity>
            </>
          )}
          {disputing && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>What went wrong?</Text>
              <TextInput value={reason} onChangeText={setReason} multiline placeholder="e.g. Only 6 of 10 bags arrived at Kopfontein"
                placeholderTextColor={colors.textMuted} style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Dispute reason" />
              <TouchableOpacity style={[st.primary, { backgroundColor: "#DC2626" }, (reason.trim().length < 10 || busy) && { opacity: 0.5 }]}
                disabled={reason.trim().length < 10 || busy} onPress={dispute}>
                <Text style={st.primaryText}>Open dispute</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>The money stays in escrow while BukkaPay's trade desk reviews it.</Text>
            </View>
          )}

          <Text style={[st.section, { color: colors.text }]}>Timeline</Text>
          {e.events?.map((ev, i) => (
            <View key={i} style={st.event}>
              <View style={st.dot} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{EVENT_LABEL[ev.event] ?? ev.event}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{format(new Date(ev.at), "d MMM yyyy, HH:mm")}{ev.note ? ` · ${ev.note}` : ""}</Text>
              </View>
            </View>
          ))}

          <Text style={[st.section, { color: colors.text }]}>Receipts</Text>
          {e.receipts?.map((r) => (
            <TouchableOpacity key={r.number} onPress={() => shareReceipt(r.number).catch((err) => toast({ title: err.message, variant: "destructive" }))}
              style={[st.card, st.receipt, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={22} color={PRIMARY} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{r.number}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.kind.replace(/_/g, " ")} · {format(new Date(r.issuedAt), "d MMM yyyy")}</Text>
              </View>
              <Ionicons name="share-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <PinPrompt visible={pinOpen} title="Pay the supplier" onCancel={() => setPinOpen(false)} onSubmit={confirm} />
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
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, minHeight: 90, marginVertical: 10, textAlignVertical: "top" },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  link: { color: PRIMARY, fontWeight: "600", textAlign: "center", marginTop: 4 },
  section: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  event: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY, marginTop: 5 },
  receipt: { flexDirection: "row", alignItems: "center", gap: 12 },
});
