/**
 * Send abroad to a bank account or mobile wallet.
 * Recipient → amount → transparent quote (rate locked for 60 s) → PIN → live status.
 * If the recipient already uses BukkaPay, it's instant and free (no payout partner).
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PinPrompt from "../components/PinPrompt";
import { fetchCards } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import {
  addRecipient, confirmPayout, COUNTRY_NAMES, fetchCorridors, fetchPayout, fetchRecipients, fromMinor, PURPOSES, quotePayout, toMinor,
  type Payout, type Recipient,
} from "../lib/payouts";

type Step = "recipient" | "new" | "amount" | "review" | "done";

export default function SendAbroad() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("recipient");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"send" | "receive">("send");
  const [purpose, setPurpose] = useState("family_support");
  const [quote, setQuote] = useState<Payout | null>(null);
  const [busy, setBusy] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [left, setLeft] = useState(0);

  const recipients = useQuery({ queryKey: ["payout-recipients"], queryFn: fetchRecipients });
  const wallets = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const list: any[] = wallets.data || [];
  useEffect(() => { if (!walletId && list.length) setWalletId((list.find((w) => w.isDefault) || list[0]).id); }, [list.length]);
  const wallet = list.find((w) => w.id === walletId);

  // Quote countdown.
  useEffect(() => {
    if (!quote || step !== "review") return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(quote.quoteExpiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [quote, step]);

  // Live status after sending.
  const live = useQuery({ queryKey: ["payout", quote?.id], queryFn: () => fetchPayout(quote!.id), enabled: step === "done" && !!quote,
                          refetchInterval: (q) => (["paid", "reversed"].includes(q.state.data?.status ?? "") ? false : 4000) });

  const getQuote = async () => {
    const minor = toMinor(amount);
    if (!recipient || !wallet || !minor) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    setBusy(true);
    try {
      setQuote(await quotePayout({ sourceWalletId: wallet.id, recipientId: recipient.id, amount: minor, side, purpose }));
      setStep("review");
    } catch (e: any) {
      toast({ title: "Couldn't get a quote", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const send = async (pin: string) => {
    try {
      const p = await confirmPayout(quote!.id, pin);
      setQuote(p);
      setAskPin(false);
      setStep("done");
      ["cards", "transactions"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      setAskPin(false);
      toast({ title: "Not sent", description: e?.message, variant: "destructive" });
      if (/expired/i.test(e?.message || "")) setStep("amount");
    }
  };

  const header = (title: string, back: () => void) => (
    <View style={st.header}>
      <TouchableOpacity onPress={back} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
      <Text style={[st.title, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (step === "new") return <NewRecipient colors={colors} onBack={() => setStep("recipient")}
    onSaved={(r) => { qc.invalidateQueries({ queryKey: ["payout-recipients"] }); setRecipient(r); setStep("amount"); }} />;

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      {step === "recipient" && (
        <>
          {header("Send abroad", () => router.back())}
          <Text style={[st.muted, { color: colors.textMuted }]}>To a bank account or mobile wallet in {Object.keys(COUNTRY_NAMES).length} African countries.</Text>
          <TouchableOpacity style={[st.panel, st.row, { backgroundColor: colors.card, borderColor: colors.primary }]} onPress={() => setStep("new")}>
            <View style={[st.icon, { backgroundColor: colors.primaryLight }]}><Ionicons name="person-add-outline" size={20} color={colors.primary} /></View>
            <Text style={[st.label, { color: colors.primary, flex: 1 }]}>New recipient</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
          {recipients.isLoading ? <ActivityIndicator color={colors.primary} /> : (recipients.data || []).map((r) => (
            <TouchableOpacity key={r.id} style={[st.panel, st.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setRecipient(r); setStep("amount"); }}>
              <View style={[st.icon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={r.method === "bank" ? "business-outline" : "phone-portrait-outline"} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.label, { color: colors.text }]}>{r.nickname || `${r.firstName} ${r.lastName}`}</Text>
                <Text style={[st.muted, { color: colors.textMuted }]}>{COUNTRY_NAMES[r.country] || r.country} · {r.bankName || r.method} · {r.accountHint}</Text>
              </View>
              <Text style={[st.ccy, { color: colors.textMuted }]}>{r.currency}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {step === "amount" && recipient && (
        <>
          {header(`To ${recipient.firstName}`, () => setStep("recipient"))}
          <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.field, { color: colors.textMuted }]}>FROM</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {list.map((w) => (
                <TouchableOpacity key={w.id} onPress={() => setWalletId(w.id)}
                  style={[st.chip, { borderColor: w.id === walletId ? colors.primary : colors.border, backgroundColor: w.id === walletId ? colors.primaryLight : "transparent" }]}>
                  <Text style={[st.ccy, { color: colors.text }]}>{w.currency} {Number(w.balance).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={st.toggle}>
              {(["send", "receive"] as const).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSide(s)} style={[st.toggleBtn, side === s && { backgroundColor: colors.primary }]}>
                  <Text style={{ color: side === s ? "#fff" : colors.textSecondary, fontWeight: "700" }}>
                    {s === "send" ? `I send (${wallet?.currency ?? ""})` : `They get (${recipient.currency})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={colors.textMuted} style={[st.amount, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Amount" />
            <Text style={[st.field, { color: colors.textMuted }]}>REASON</Text>
            <View style={st.wrap}>
              {PURPOSES.map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => setPurpose(k)}
                  style={[st.chip, { borderColor: purpose === k ? colors.primary : colors.border, backgroundColor: purpose === k ? colors.primaryLight : "transparent" }]}>
                  <Text style={{ color: purpose === k ? colors.primary : colors.textSecondary, fontWeight: "600" }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={getQuote} disabled={busy}>
            <Text style={st.btnText}>{busy ? "Getting today's rate…" : "See the quote"}</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "review" && quote && recipient && (
        <>
          {header("Review", () => setStep("amount"))}
          {quote.inNetwork && (
            <View style={[st.notice, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name="flash" size={18} color="#15803D" />
              <Text style={{ color: "#14532D", flex: 1 }}>{recipient.firstName} uses BukkaPay: this arrives instantly and free.</Text>
            </View>
          )}
          <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Row k="They get" v={fromMinor(quote.receiveAmount, quote.receiveCurrency)} colors={colors} strong />
            <Row k="You send" v={fromMinor(quote.sendAmount, quote.sendCurrency)} colors={colors} />
            <Row k="Fee" v={quote.feeAmount ? fromMinor(quote.feeAmount, quote.sendCurrency) : "Free"} colors={colors} />
            {quote.fxRate && <Row k="Rate" v={`1 ${quote.sendCurrency} = ${Number(quote.fxRate).toFixed(4)} ${quote.receiveCurrency}`} colors={colors} />}
            {quote.fxSpreadAmount > 0 && <Row k="Included in the rate (our margin)" v={fromMinor(quote.fxSpreadAmount, quote.receiveCurrency)} colors={colors} />}
            <Row k="Total from your wallet" v={fromMinor(quote.totalAmount, quote.sendCurrency)} colors={colors} strong />
            <Text style={[st.muted, { color: left > 10 ? colors.textMuted : "#B45309" }]}>
              {left > 0 ? `Rate locked for ${left}s` : "This quote expired. Go back for a fresh rate."}
            </Text>
          </View>
          <TouchableOpacity style={[st.btn, { backgroundColor: left > 0 ? colors.primary : colors.border }]} disabled={left <= 0} onPress={() => setAskPin(true)}>
            <Text style={st.btnText}>Send {fromMinor(quote.totalAmount, quote.sendCurrency)}</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "done" && quote && (
        <>
          {header("Transfer", () => router.back())}
          <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <StatusBadge status={live.data?.status || quote.status} colors={colors} />
            <Text style={[st.big, { color: colors.text }]}>{fromMinor(quote.receiveAmount, quote.receiveCurrency)}</Text>
            <Text style={[st.muted, { color: colors.textMuted }]}>to {recipient?.firstName} · ref {quote.reference}</Text>
            {live.data?.failureReason && <Text style={[st.muted, { color: "#B91C1C", textAlign: "center" }]}>{live.data.failureReason}. Your money is back in your wallet.</Text>}
          </View>
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(tabs)" as any)}>
            <Text style={st.btnText}>Done</Text>
          </TouchableOpacity>
        </>
      )}
      <PinPrompt visible={askPin} title="Confirm transfer" subtitle={quote ? fromMinor(quote.totalAmount, quote.sendCurrency) : undefined}
        onCancel={() => setAskPin(false)} onSubmit={send} />
    </ScrollView>
  );
}

const STATUS_TEXT: Record<string, [string, string, any]> = {
  confirmed: ["Sending…", "#2563EB", "time-outline"], submitted: ["On its way", "#2563EB", "paper-plane-outline"],
  processing: ["On its way", "#2563EB", "paper-plane-outline"], paid: ["Delivered", "#15803D", "checkmark-circle"],
  failed: ["Couldn't deliver", "#B91C1C", "alert-circle"], reversed: ["Refunded", "#B45309", "refresh-circle"],
  returned: ["Returned", "#B45309", "refresh-circle"],
};

function StatusBadge({ status, colors }: { status: string; colors: any }) {
  const [text, color, icon] = STATUS_TEXT[status] || [status, colors.textMuted, "ellipse-outline"];
  return (
    <View style={[st.badge, { backgroundColor: color + "1A" }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

function Row({ k, v, colors, strong }: { k: string; v: string; colors: any; strong?: boolean }) {
  return (
    <View style={st.kv}>
      <Text style={[st.muted, { color: colors.textMuted, flex: 1 }]}>{k}</Text>
      <Text style={[strong ? st.label : st.muted, { color: colors.text }]}>{v}</Text>
    </View>
  );
}

function NewRecipient({ colors, onBack, onSaved }: { colors: any; onBack: () => void; onSaved: (r: Recipient) => void }) {
  const { toast } = useToast();
  const corridors = useQuery({ queryKey: ["payout-corridors"], queryFn: fetchCorridors });
  const [country, setCountry] = useState("ZW");
  const [method, setMethod] = useState<"bank" | "mobile_wallet">("mobile_wallet");
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const c = useMemo(() => (corridors.data || []).find((x) => x.country === country), [corridors.data, country]);
  useEffect(() => { if (c && method === "mobile_wallet" && !c.mobileWallet) setMethod("bank"); }, [c]);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await addRecipient({ country, currency: c?.currency, method, firstName: f.firstName, lastName: f.lastName,
        nickname: f.nickname, bankCode: f.bankCode, bankName: f.bankCode, branchCode: f.branchCode, accountNumber: f.accountNumber,
        msisdn: f.msisdn, operator: f.operator }));
    } catch (e: any) {
      toast({ title: "Check the details", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const input = (k: string, label: string, extra: any = {}) => (
    <TextInput key={k} value={f[k] || ""} onChangeText={set(k)} placeholder={label} placeholderTextColor={colors.textMuted}
      style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel={label} {...extra} />
  );

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[st.title, { color: colors.text }]}>New recipient</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.field, { color: colors.textMuted }]}>COUNTRY</Text>
        <View style={st.wrap}>
          {(corridors.data || []).map((x) => (
            <TouchableOpacity key={x.country} onPress={() => setCountry(x.country)}
              style={[st.chip, { borderColor: country === x.country ? colors.primary : colors.border, backgroundColor: country === x.country ? colors.primaryLight : "transparent" }]}>
              <Text style={{ color: country === x.country ? colors.primary : colors.textSecondary, fontWeight: "600" }}>{COUNTRY_NAMES[x.country] || x.country}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={st.toggle}>
          {(["mobile_wallet", "bank"] as const).filter((m) => m === "bank" || c?.mobileWallet).map((m) => (
            <TouchableOpacity key={m} onPress={() => setMethod(m)} style={[st.toggleBtn, method === m && { backgroundColor: colors.primary }]}>
              <Text style={{ color: method === m ? "#fff" : colors.textSecondary, fontWeight: "700" }}>{m === "bank" ? "Bank account" : "Mobile wallet"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {input("firstName", "First name", { autoCapitalize: "words" })}
        {input("lastName", "Last name", { autoCapitalize: "words" })}
        {method === "mobile_wallet" ? (
          <>
            {input("msisdn", "Mobile number", { keyboardType: "phone-pad" })}
            <View style={st.wrap}>
              {(c?.operators || []).map((op) => (
                <TouchableOpacity key={op} onPress={() => set("operator")(op)}
                  style={[st.chip, { borderColor: f.operator === op ? colors.primary : colors.border, backgroundColor: f.operator === op ? colors.primaryLight : "transparent" }]}>
                  <Text style={{ color: f.operator === op ? colors.primary : colors.textSecondary, fontWeight: "600", textTransform: "capitalize" }}>{op}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            {input("bankCode", "Bank (e.g. fnb, absa, stanbic)", { autoCapitalize: "none" })}
            {input("accountNumber", "Account number", { keyboardType: "number-pad" })}
            {c?.branchCode && input("branchCode", "Branch code (optional)", { keyboardType: "number-pad" })}
          </>
        )}
        {input("nickname", "Nickname (optional)")}
        <Text style={[st.muted, { color: colors.textMuted }]}>Paid in {c?.currency ?? "local currency"}. Check the details: money sent to a wrong account can take days to come back.</Text>
      </View>
      <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={save} disabled={busy}>
        <Text style={st.btnText}>{busy ? "Checking…" : "Save recipient"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44 },
  back: { padding: 8 },
  title: { fontSize: 18, fontWeight: "700" },
  panel: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 18 },
  ccy: { fontSize: 12, fontWeight: "800" },
  field: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { flexDirection: "row", gap: 6 },
  toggleBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  amount: { fontSize: 30, fontWeight: "800", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  big: { fontSize: 32, fontWeight: "800" },
});
