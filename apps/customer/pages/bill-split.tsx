import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createMoneyRequest, fetchCards, myMoneyRequests, cancelMoneyRequest, type MoneyRequest } from "../lib/api";
import { getCurrency } from "../lib/currency";
import { queryClient } from "../lib/queryClient";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

const SPLIT_PREFIX = "Split: ";

type Person = { who: string; share: string };

/**
 * Split a bill: each friend gets a real BukkaPay money request for their
 * share (paid from their wallet, on the ledger). Your own share is what's
 * left after theirs. Tracking = the status of those requests.
 */
export default function BillSplit() {
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [people, setPeople] = useState<Person[]>([{ who: "", share: "" }]);
  const [equal, setEqual] = useState(true);
  const [sending, setSending] = useState(false);

  const { data: wallets } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const currency: string = ((wallets || []).find((w: any) => w.isDefault) || (wallets || [])[0])?.currency || "ZAR";
  const symbol = getCurrency(currency).symbol;
  const { data: requests, isLoading } = useQuery({ queryKey: ["money-requests"], queryFn: myMoneyRequests });

  const filled = people.filter((p) => p.who.trim());
  const totalNum = Number(total) || 0;
  // Equal split includes you: total / (friends + 1), rounded down to cents;
  // any rounding remainder stays with you.
  const equalShare = filled.length ? Math.floor((totalNum / (filled.length + 1)) * 100) / 100 : 0;
  const shares = filled.map((p) => (equal ? equalShare : Number(p.share) || 0));
  const friendsTotal = shares.reduce((a, b) => a + b, 0);
  const yourShare = Math.max(0, totalNum - friendsTotal);
  const valid = title.trim() && totalNum > 0 && filled.length > 0 && shares.every((s) => s > 0) && friendsTotal <= totalNum;

  const send = async () => {
    setSending(true);
    const failed: string[] = [];
    for (let i = 0; i < filled.length; i++) {
      try {
        await createMoneyRequest({
          amount: shares[i].toFixed(2), currency, payer: filled[i].who.trim(),
          description: `${SPLIT_PREFIX}${title.trim()}`, expiresInHours: 24 * 7,
        });
      } catch (e: any) {
        failed.push(`${filled[i].who}: ${e.message}`);
      }
    }
    setSending(false);
    queryClient.invalidateQueries({ queryKey: ["money-requests"] });
    if (failed.length) {
      toast({ title: "Some requests weren't sent", description: failed.join("\n"), variant: "destructive" });
    } else {
      toast({ title: "Split sent", description: `${filled.length} friend${filled.length > 1 ? "s" : ""} asked to pay their share.` });
      setTitle(""); setTotal(""); setPeople([{ who: "", share: "" }]);
    }
  };

  const splits = (requests || []).filter((r) => (r.description || "").startsWith(SPLIT_PREFIX));
  const grouped = splits.reduce((acc: Record<string, MoneyRequest[]>, r) => {
    const key = (r.description || "").slice(SPLIT_PREFIX.length);
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Split a bill</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput placeholder="What was it? e.g. Dinner at Mama's" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <TextInput placeholder={`Total (${currency})`} placeholderTextColor={colors.textMuted} value={total} onChangeText={setTotal} keyboardType="decimal-pad"
          style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <View style={styles.row}>
          {[true, false].map((v) => (
            <TouchableOpacity key={String(v)} onPress={() => setEqual(v)} style={[styles.chip, { borderColor: colors.primary, backgroundColor: equal === v ? colors.primary : "transparent" }]}>
              <Text style={{ color: equal === v ? "#fff" : colors.primary, fontWeight: "600" }}>{v ? "Split equally" : "Custom amounts"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>FRIENDS (BukkaPay wallet ID or username)</Text>
        {people.map((p, i) => (
          <View key={i} style={styles.row}>
            <TextInput placeholder="@username or wallet ID" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={p.who}
              onChangeText={(v) => setPeople(people.map((x, j) => (j === i ? { ...x, who: v } : x)))}
              style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border }]} />
            {equal ? (
              <Text style={[styles.share, { color: colors.text }]}>{p.who.trim() ? `${symbol}${equalShare.toFixed(2)}` : ""}</Text>
            ) : (
              <TextInput placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={p.share}
                onChangeText={(v) => setPeople(people.map((x, j) => (j === i ? { ...x, share: v } : x)))}
                style={[styles.input, { width: 96, color: colors.text, borderColor: colors.border }]} />
            )}
            {people.length > 1 && (
              <TouchableOpacity onPress={() => setPeople(people.filter((_, j) => j !== i))}><Ionicons name="close-circle" size={22} color={colors.textMuted} /></TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity onPress={() => setPeople([...people, { who: "", share: "" }])}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Add friend</Text>
        </TouchableOpacity>

        {totalNum > 0 && (
          <Text style={[styles.muted, { color: friendsTotal > totalNum ? "#DC2626" : colors.textMuted }]}>
            {friendsTotal > totalNum ? "Friends' shares add up to more than the total." : `Your share: ${symbol}${yourShare.toFixed(2)}`}
          </Text>
        )}
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: valid && !sending ? 1 : 0.5 }]} disabled={!valid || sending} onPress={send}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send payment requests</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Your splits</Text>
      {isLoading && <ActivityIndicator color={colors.primary} />}
      {!isLoading && Object.keys(grouped).length === 0 && <Text style={[styles.muted, { color: colors.textMuted }]}>No splits yet.</Text>}
      {Object.entries(grouped).map(([name, reqs]) => {
        const paid = reqs.filter((r) => r.status === "paid");
        return (
          <View key={name} style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.value, { color: colors.text }]}>{name}</Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>{paid.length}/{reqs.length} paid</Text>
            </View>
            {reqs.map((r) => (
              <View key={r.id} style={styles.rowBetween}>
                <Text style={{ color: colors.text, flex: 1 }}>{r.recipientName || "Friend"}</Text>
                <Text style={{ color: colors.text, marginRight: 10 }}>{getCurrency(r.currency).symbol}{r.amount}</Text>
                <Text style={{ color: r.status === "paid" ? "#059669" : r.status === "pending" ? "#D97706" : colors.textMuted, width: 70, textAlign: "right" }}>{r.status}</Text>
                {r.status === "pending" && (
                  <TouchableOpacity onPress={async () => { await cancelMoneyRequest(r.id); queryClient.invalidateQueries({ queryKey: ["money-requests"] }); }}>
                    <Ionicons name="close" size={18} color={colors.textMuted} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 8 },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  panel: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 4 },
  share: { width: 96, textAlign: "right", fontWeight: "600" },
  muted: { fontSize: 13 },
  value: { fontSize: 15, fontWeight: "700" },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
});
