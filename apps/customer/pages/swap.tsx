/** Swap between your own ZAR, BWP and USD wallets at the live rate. */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCards } from "../lib/api";
import { doSwap, newIdempotencyKey, swapQuote, type SwapQuote } from "../lib/trade";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import PinPrompt from "../components/PinPrompt";

const PRIMARY = "#7C3AED";
const CURRENCIES = ["ZAR", "BWP", "USD"];

export default function Swap() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const { data: cards = [] } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const [from, setFrom] = useState("ZAR");
  const [to, setTo] = useState("BWP");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey());

  const source = useMemo(() => (cards as any[]).find((c) => c.currency === from), [cards, from]);

  useEffect(() => {
    setQuote(null);
    const n = Number(amount);
    if (!amount || !(n > 0) || from === to) return;
    const t = setTimeout(async () => {
      setQuoting(true);
      try { setQuote(await swapQuote(from, to, Number(amount).toFixed(2))); }
      catch (e: any) { toast({ title: "No quote", description: e.message, variant: "destructive" }); }
      finally { setQuoting(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [from, to, amount]);

  const confirm = async (pin: string) => {
    if (!quote || !source) return;
    const res = await doSwap({ fromCardId: source.id, toCurrency: to, amount: quote.amount, expectedReceive: quote.receive, pin }, key);
    setPinOpen(false);
    setKey(newIdempotencyKey());
    qc.invalidateQueries({ queryKey: ["cards"] });
    toast({ title: "Swapped", description: `${getCurrency(res.from).symbol}${res.debited} → ${getCurrency(res.to).symbol}${res.received}` });
    router.back();
  };

  const chip = (value: string, selected: string, set: (v: string) => void, disabled?: string) => (
    <View style={st.chips}>
      {CURRENCIES.map((c) => (
        <TouchableOpacity key={c} disabled={c === disabled} onPress={() => set(c)}
          style={[st.chip, { borderColor: selected === c ? PRIMARY : colors.border, backgroundColor: selected === c ? PRIMARY : "transparent", opacity: c === disabled ? 0.35 : 1 }]}>
          <Text style={{ color: selected === c ? "#fff" : colors.text, fontWeight: "700" }}>{c}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Swap currency</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.label, { color: colors.textMuted }]}>From</Text>
          {chip(from, from, (v) => { setFrom(v); if (v === to) setTo(from); })}
          <Text style={{ color: colors.textMuted }}>Available: {source ? `${getCurrency(from).symbol}${Number(source.balance).toFixed(2)}` : `no ${from} wallet`}</Text>
          <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0.00"
            placeholderTextColor={colors.textMuted} style={[st.amount, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Amount to swap" />
        </View>
        <TouchableOpacity style={st.flip} onPress={() => { setFrom(to); setTo(from); }} accessibilityLabel="Swap direction">
          <Ionicons name="swap-vertical" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.label, { color: colors.textMuted }]}>To</Text>
          {chip(to, to, setTo, from)}
          {quoting && <ActivityIndicator color={PRIMARY} style={{ marginTop: 8 }} />}
          {quote && (
            <View style={{ marginTop: 6, gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>{getCurrency(to).symbol}{quote.receive}</Text>
              <Text style={{ color: colors.textMuted }}>1 {from} = {Number(quote.rate).toFixed(4)} {to}</Text>
              <Text style={{ color: colors.textMuted }}>FX spread {quote.spreadPercent}% · {getCurrency(to).symbol}{quote.spread} (included above)</Text>
              {Number(quote.fee ?? 0) > 0 && (
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  You pay {getCurrency(from).symbol}{quote.amount} + {getCurrency(from).symbol}{quote.fee} fee = {getCurrency(from).symbol}{quote.total}
                </Text>
              )}
              {!!quote.note && <Text style={{ color: "#B45309" }}>{quote.note}</Text>}
            </View>
          )}
        </View>
        <TouchableOpacity style={[st.primary, (!quote || !source) && { opacity: 0.5 }]} disabled={!quote || !source} onPress={() => setPinOpen(true)}>
          <Text style={st.primaryText}>Swap now</Text>
        </TouchableOpacity>
        <Text style={[st.note, { color: colors.textMuted }]}>The rate is fixed when you confirm. If it changes before then, we'll show you the new amount first.</Text>
      </ScrollView>
      <PinPrompt visible={pinOpen} title="Confirm swap" onCancel={() => setPinOpen(false)} onSubmit={confirm} />
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
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  chips: { flexDirection: "row", gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  amount: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 24, fontWeight: "700", marginTop: 10 },
  flip: { alignSelf: "center", backgroundColor: PRIMARY, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginVertical: -4, zIndex: 2 },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center" },
});
