/** Cash at local shops: withdraw with a one-time code, deposit by showing
 *  your wallet ID, and find agents near you. */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { fetchCards } from "../lib/api";
import {
  cancelCashOut, fetchAgentTransactions, fetchAgents, quoteCashOut, requestCashOut, type AgentTx, type CashOutQuote,
} from "../lib/agents";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import PinPrompt from "../components/PinPrompt";

const PRIMARY = "#7C3AED";
type Tab = "withdraw" | "deposit" | "find";

export default function CashAgents() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("withdraw");

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Cash agents</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={[st.tabs, { borderColor: colors.border }]}>
        {([["withdraw", "Withdraw"], ["deposit", "Deposit"], ["find", "Find agents"]] as [Tab, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { backgroundColor: PRIMARY }]} accessibilityRole="tab">
            <Text style={{ color: tab === k ? "#fff" : colors.text, fontWeight: "700" }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        {tab === "withdraw" && <Withdraw />}
        {tab === "deposit" && <Deposit />}
        {tab === "find" && <FindAgents />}
        <History />
      </ScrollView>
    </View>
  );
}

function Withdraw() {
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: cards = [] } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const [walletId, setWalletId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<CashOutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [issued, setIssued] = useState<AgentTx | null>(null);
  const wallet = useMemo(() => (cards as any[]).find((c) => c.id === walletId) ?? (cards as any[])[0], [cards, walletId]);

  useEffect(() => {
    setQuote(null);
    if (!wallet || !(Number(amount) > 0)) return;
    const t = setTimeout(async () => {
      setQuoting(true);
      try { setQuote(await quoteCashOut(wallet.id, Number(amount).toFixed(2))); }
      catch (e: any) { toast({ title: "Can't quote", description: e.message, variant: "destructive" }); }
      finally { setQuoting(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [wallet?.id, amount]);

  const confirm = async (pin: string) => {
    if (!wallet || !quote) return;
    const tx = await requestCashOut(wallet.id, quote.amount, pin);
    setPinOpen(false);
    setIssued(tx);
    setAmount("");
    qc.invalidateQueries({ queryKey: ["cards"] });
    qc.invalidateQueries({ queryKey: ["agent-tx"] });
  };

  if (issued?.code) return <CodeCard tx={issued} onDone={() => setIssued(null)} />;

  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.label, { color: colors.textMuted }]}>Withdraw cash at any agent</Text>
      <Text style={{ color: colors.textMuted, marginTop: 4 }}>
        You get a one-time 8-digit code. Show it at any BukkaPay agent within 30 minutes and they hand you the cash.
      </Text>
      <View style={st.chips}>
        {(cards as any[]).map((c) => (
          <TouchableOpacity key={c.id} onPress={() => setWalletId(c.id)}
            style={[st.chip, { borderColor: wallet?.id === c.id ? PRIMARY : colors.border, backgroundColor: wallet?.id === c.id ? PRIMARY : "transparent" }]}>
            <Text style={{ color: wallet?.id === c.id ? "#fff" : colors.text, fontWeight: "700" }}>{c.currency}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {wallet && <Text style={{ color: colors.textMuted }}>Available: {wallet.currency} {Number(wallet.balance).toFixed(2)}</Text>}
      <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0.00"
        placeholderTextColor={colors.textMuted} style={[st.amount, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Amount to withdraw" />
      {quoting && <ActivityIndicator color={PRIMARY} style={{ marginTop: 8 }} />}
      {quote && (
        <View style={{ marginTop: 10, gap: 2 }}>
          <Text style={{ color: colors.text }}>Agent fee: {quote.currency} {quote.fee}</Text>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Taken from your wallet: {quote.currency} {quote.total}</Text>
        </View>
      )}
      <TouchableOpacity style={[st.primary, { marginTop: 14 }, !quote && { opacity: 0.5 }]} disabled={!quote} onPress={() => setPinOpen(true)}>
        <Text style={st.primaryText}>Get withdrawal code</Text>
      </TouchableOpacity>
      <PinPrompt visible={pinOpen} title="Confirm withdrawal" subtitle={quote ? `${quote.currency} ${quote.total} will be held for your code` : undefined}
        onCancel={() => setPinOpen(false)} onSubmit={confirm} />
    </View>
  );
}

function CodeCard({ tx, onDone }: { tx: AgentTx; onDone: () => void }) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.floor(((tx.expiresAt ? Date.parse(tx.expiresAt) : now) - now) / 1000));
  const code = tx.code ?? "";
  const cancel = async () => {
    try {
      await cancelCashOut(tx.id);
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["agent-tx"] });
      toast({ title: "Code cancelled", description: "The money is back in your wallet." });
      onDone();
    } catch (e: any) { toast({ title: "Not cancelled", description: e.message, variant: "destructive" }); }
  };
  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: PRIMARY, alignItems: "center" }]}>
      <Text style={[st.label, { color: colors.textMuted }]}>Your withdrawal code</Text>
      <Text style={[st.code, { color: colors.text }]} selectable accessibilityLabel={`Code ${code.split("").join(" ")}`}>
        {code.slice(0, 4)} {code.slice(4)}
      </Text>
      <Text style={{ color: colors.text, fontWeight: "700" }}>Collect {tx.currency} {tx.amount}</Text>
      <Text style={{ color: left > 0 ? colors.textMuted : "#DC2626", marginTop: 4 }}>
        {left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Expired: the money returns to your wallet automatically"}
      </Text>
      <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 10, fontSize: 12 }}>
        Only show this code to the agent serving you. BukkaPay staff will never ask for it. It is shown once; if you lose it, cancel and make a new one.
      </Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <TouchableOpacity style={[st.secondary, { borderColor: colors.border }]} onPress={() => Clipboard.setStringAsync(code)}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.secondary, { borderColor: "#DC2626" }]} onPress={cancel}>
          <Text style={{ color: "#DC2626", fontWeight: "700" }}>Cancel code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.secondary, { borderColor: colors.border }]} onPress={onDone}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Deposit() {
  const { colors } = useTheme();
  const { toast } = useToast();
  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const id = me?.walletId ?? me?.username ?? "";
  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.label, { color: colors.textMuted }]}>Deposit cash</Text>
      <Text style={{ color: colors.text, marginTop: 6, lineHeight: 20 }}>
        1. Go to any BukkaPay agent.{"\n"}2. Give them your wallet ID below and the cash.{"\n"}3. The money is in your wallet straight away. Deposits are free.
      </Text>
      <TouchableOpacity style={[st.walletId, { borderColor: PRIMARY }]} onPress={async () => { await Clipboard.setStringAsync(id); toast({ title: "Wallet ID copied" }); }}
        accessibilityLabel="Copy wallet ID">
        <Text style={[st.label, { color: colors.textMuted }]}>Your wallet ID</Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: 1 }}>{id || "…"}</Text>
        <Text style={{ color: PRIMARY, fontWeight: "600", marginTop: 4 }}>Tap to copy</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>Count your cash with the agent and wait for the "Cash deposited" notification before you leave.</Text>
    </View>
  );
}

function FindAgents() {
  const { colors } = useTheme();
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const { data: agents = [], isLoading, error } = useQuery({ queryKey: ["agents", search], queryFn: () => fetchAgents(search || undefined) });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={city} onChangeText={setCity} placeholder="Town or city" placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => setSearch(city.trim())} returnKeyType="search"
          style={[st.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} accessibilityLabel="Town or city" />
        <TouchableOpacity style={[st.primary, { paddingHorizontal: 18, paddingVertical: 12 }]} onPress={() => setSearch(city.trim())}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {isLoading && <ActivityIndicator color={PRIMARY} />}
      {error && <Text style={{ color: "#DC2626" }}>{(error as Error).message}</Text>}
      {!isLoading && !agents.length && (
        <Text style={{ color: colors.textMuted, textAlign: "center", marginVertical: 16 }}>
          {search ? `No agents in ${search} yet.` : "No agents in your country yet."}
        </Text>
      )}
      {agents.map((a) => (
        <View key={a.id} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{a.name}</Text>
          <Text style={{ color: colors.textMuted }}>{a.address}{a.city ? `, ${a.city}` : ""}</Text>
          {a.openingHours && <Text style={{ color: colors.textMuted, marginTop: 2 }}>{a.openingHours}</Text>}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {a.phone && (
              <TouchableOpacity style={[st.secondary, { borderColor: colors.border }]} onPress={() => Linking.openURL(`tel:${a.phone}`)}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>Call</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.secondary, { borderColor: colors.border }]} onPress={() => Linking.openURL(
              a.latitude && a.longitude
                ? `https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.address} ${a.city ?? ""}`)}`)}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Directions</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

function History() {
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: txs = [] } = useQuery({ queryKey: ["agent-tx"], queryFn: fetchAgentTransactions });
  if (!txs.length) return null;
  const cancel = async (id: string) => {
    try {
      await cancelCashOut(id);
      qc.invalidateQueries({ queryKey: ["agent-tx"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      toast({ title: "Code cancelled", description: "The money is back in your wallet." });
    } catch (e: any) { toast({ title: "Not cancelled", description: e.message, variant: "destructive" }); }
  };
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={[st.label, { color: colors.textMuted, marginBottom: 8 }]}>Recent cash activity</Text>
      {txs.slice(0, 20).map((t) => (
        <View key={t.id} style={[st.row, { borderColor: colors.border }]}>
          <Ionicons name={t.kind === "cash_in" ? "arrow-down-circle" : "arrow-up-circle"} size={26} color={t.kind === "cash_in" ? "#059669" : PRIMARY} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{t.kind === "cash_in" ? "Cash deposit" : "Cash withdrawal"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(t.completedAt ?? t.createdAt).toLocaleString()} · {t.status}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{t.currency} {t.amount}</Text>
            {t.kind === "cash_out" && t.status === "pending" && (
              <TouchableOpacity onPress={() => cancel(t.id)}><Text style={{ color: "#DC2626", fontWeight: "700", fontSize: 12 }}>Cancel</Text></TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  tabs: { flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 999 },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  amount: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 24, fontWeight: "700", marginTop: 10 },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  code: { fontSize: 40, fontWeight: "900", letterSpacing: 6, marginVertical: 10, fontVariant: ["tabular-nums"] },
  walletId: { borderWidth: 2, borderStyle: "dashed", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 14 },
  search: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
});
