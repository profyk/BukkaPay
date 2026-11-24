/**
 * Transfer: every way money moves, in one place.
 *  - Send: to a person, abroad, a supplier, by link or QR.
 *  - My wallets: between your own wallets (instant and free), or convert
 *    between currencies (swap) with a live quote.
 *  - Withdraw: to a South African bank account through Stitch.
 * Every action re-checks the balance on the server; an empty wallet gets a
 * "Top up" prompt instead of a failed payment.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCards } from "../lib/api";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import PinPrompt from "../components/PinPrompt";
import { doSwap, newIdempotencyKey, swapQuote, type SwapQuote } from "../lib/trade";
import {
  bankRailStatus, fetchBanks, maskAccount, moveBetweenOwn, needsTopUp, rememberBank, savedBank, withdrawToBank,
  type Bank, type BankDetails,
} from "../lib/money";

type Tab = "send" | "wallets" | "withdraw";
type Wallet = { id: string; title: string; currency: string; balance: string | number; isDefault?: boolean };

const money = (ccy: string, v: string | number) => `${getCurrency(ccy).symbol}${Number(v || 0).toFixed(2)}`;
const cleanAmount = (t: string) => t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/^(\d*\.\d{0,2}).*$/, "$1");

export default function Transfer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>((["send", "wallets", "withdraw"] as Tab[]).includes(params.section as Tab) ? (params.section as Tab) : "send");
  useEffect(() => { if (params.section && ["send", "wallets", "withdraw"].includes(params.section)) setTab(params.section as Tab); }, [params.section]);

  const wallets = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const list: Wallet[] = (wallets.data as Wallet[]) || [];

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <View style={st.header}>
        <Text style={[st.title, { color: colors.text }]}>Transfer</Text>
        <Text style={[st.subtitle, { color: colors.textSecondary }]}>Send, move between your wallets, or withdraw to your bank</Text>
      </View>

      <View style={[st.segment, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="tablist">
        {([["send", "Send", "paper-plane-outline"], ["wallets", "My wallets", "swap-horizontal"], ["withdraw", "Withdraw", "business-outline"]] as [Tab, string, any][]).map(([key, label, icon]) => {
          const on = tab === key;
          return (
            <TouchableOpacity key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[st.segBtn, on && { backgroundColor: colors.primary }]}>
              <Ionicons name={icon} size={16} color={on ? "#fff" : colors.textSecondary} />
              <Text style={[st.segText, { color: on ? "#fff" : colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {wallets.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        : tab === "send" ? <SendHub colors={colors} router={router} />
        : tab === "wallets" ? <BetweenWallets wallets={list} colors={colors} router={router} />
        : <Withdraw wallets={list} colors={colors} router={router} />}
    </ScrollView>
  );
}

/* ─── Send ──────────────────────────────────────────────────────────────── */

function SendHub({ colors, router }: { colors: any; router: any }) {
  const rows: [any, string, string, string][] = [
    ["person-outline", "To a BukkaPay user", "Instant and free, by @username, phone or wallet ID", "/(screens)/send-money"],
    ["globe-outline", "Send abroad", "To family or a business in another African country", "/(screens)/send-money"],
    ["briefcase-outline", "Pay a supplier", "Trade invoices, with escrow if you want it", "/(screens)/pay-supplier"],
    ["scan-outline", "Scan to pay", "Pay a shop's BukkaPay QR code", "/(tabs)/scan"],
    ["link-outline", "Request with a link", "Anyone can pay you by card, bank or wallet", "/(screens)/create-payment-link"],
    ["add-circle-outline", "Top up", "Add money from your bank", "/(screens)/topup"],
  ];
  return (
    <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 6 }]}>
      {rows.map(([icon, label, hint, href], i) => (
        <TouchableOpacity key={label} onPress={() => router.push(href as any)} accessibilityRole="button"
          style={[st.navRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <View style={[st.navIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name={icon} size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.label, { color: colors.text }]}>{label}</Text>
            <Text style={[st.muted, { color: colors.textMuted }]}>{hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ─── Shared bits ───────────────────────────────────────────────────────── */

function WalletPicker({ label, wallets, value, onChange, colors, exclude }: {
  label: string; wallets: Wallet[]; value: string; onChange: (id: string) => void; colors: any; exclude?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {wallets.filter((w) => w.id !== exclude).map((w) => {
          const on = w.id === value;
          return (
            <TouchableOpacity key={w.id} onPress={() => onChange(w.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={[st.walletChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.card }]}>
              <Text style={[st.chipCcy, { color: on ? colors.primary : colors.textMuted }]}>{w.currency}</Text>
              <Text style={[st.chipTitle, { color: colors.text }]} numberOfLines={1}>{w.title}</Text>
              <Text style={[st.chipBal, { color: Number(w.balance) > 0 ? colors.text : colors.textMuted }]}>{money(w.currency, w.balance)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AmountField({ value, onChange, currency, colors, max }: { value: string; onChange: (v: string) => void; currency: string; colors: any; max?: number }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>Amount</Text>
      <View style={[st.amountBox, { borderColor: colors.border, backgroundColor: colors.inputBg ?? colors.card }]}>
        <Text style={[st.amountSym, { color: colors.textMuted }]}>{getCurrency(currency).symbol}</Text>
        <TextInput value={value} onChangeText={(t) => onChange(cleanAmount(t))} keyboardType="decimal-pad" placeholder="0.00"
          placeholderTextColor={colors.textMuted} style={[st.amountInput, { color: colors.text }]} accessibilityLabel="Amount" />
        {max !== undefined && max > 0 && (
          <TouchableOpacity onPress={() => onChange(max.toFixed(2))} style={[st.maxBtn, { backgroundColor: colors.primaryLight }]}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>MAX</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function TopUpNudge({ colors, router, text }: { colors: any; router: any; text: string }) {
  return (
    <View style={[st.notice, { backgroundColor: "#FEF3C7" }]}>
      <Ionicons name="wallet-outline" size={18} color="#B45309" />
      <Text style={[st.noticeText, { color: "#78350F" }]}>{text}</Text>
      <TouchableOpacity onPress={() => router.push("/(screens)/topup" as any)}><Text style={{ color: "#B45309", fontWeight: "800" }}>Top up</Text></TouchableOpacity>
    </View>
  );
}

function Done({ colors, title, lines, onAgain, router }: { colors: any; title: string; lines: string[]; onAgain: () => void; router: any }) {
  return (
    <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", paddingVertical: 28 }]}>
      <View style={st.doneIcon}><Ionicons name="checkmark" size={34} color="#fff" /></View>
      <Text style={[st.doneTitle, { color: colors.text }]}>{title}</Text>
      {lines.map((l) => <Text key={l} style={[st.muted, { color: colors.textMuted, textAlign: "center" }]}>{l}</Text>)}
      <View style={[st.btnRow, { marginTop: 8 }]}>
        <TouchableOpacity style={[st.btn, st.btnGhost, { borderColor: colors.border }]} onPress={() => router.push("/(tabs)" as any)}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={onAgain}>
          <Text style={st.btnText}>Do another</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─── Between my wallets ───────────────────────────────────────────────── */

function BetweenWallets({ wallets, colors, router }: { wallets: Wallet[]; colors: any; router: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  useEffect(() => {
    if (!fromId && wallets.length) setFromId((wallets.find((w) => Number(w.balance) > 0) ?? wallets[0]).id);
  }, [wallets.length]);
  const from = wallets.find((w) => w.id === fromId);
  const to = wallets.find((w) => w.id === toId);
  const convert = !!from && !!to && from.currency !== to.currency;
  const value = Number(amount || 0);
  const balance = Number(from?.balance || 0);

  // Live quote when converting between currencies.
  useEffect(() => {
    setQuote(null);
    if (!convert || !from || !to || value <= 0) return;
    setQuoting(true);
    const t = setTimeout(() => {
      swapQuote(from.currency, to.currency, value.toFixed(2)).then(setQuote).catch(() => setQuote(null)).finally(() => setQuoting(false));
    }, 350);
    return () => clearTimeout(t);
  }, [fromId, toId, amount]);

  if (wallets.length < 2) {
    return (
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.label, { color: colors.text }]}>You have one wallet</Text>
        <Text style={[st.muted, { color: colors.textMuted }]}>Open another wallet (for example USD or BWP) to move or convert money between them.</Text>
        <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(tabs)/wallet" as any)}>
          <Text style={st.btnText}>Open a wallet</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (done) return <Done colors={colors} router={router} title="Money moved" lines={done} onAgain={() => { setDone(null); setAmount(""); }} />;

  const problem = !from ? "Choose a wallet to move from"
    : !to ? "Choose where to move it"
    : value <= 0 ? "Enter an amount"
    : value > balance ? `You have ${money(from.currency, balance)} in ${from.title}`
    : convert && !quote ? (quoting ? "Getting today's rate…" : "This conversion isn't available right now")
    : null;

  const submit = async (pin: string) => {
    try {
      if (convert && quote && from && to) {
        const r = await doSwap({ fromCardId: from.id, toCurrency: to.currency, amount: value.toFixed(2), expectedReceive: quote.receive, pin }, newIdempotencyKey());
        setDone([`${money(from.currency, r.debited)} converted to ${money(to.currency, r.received)}`, `Rate ${Number(quote.rate).toFixed(4)}`]);
      } else if (from && to) {
        await moveBetweenOwn(from.id, to.id, value.toFixed(2), pin);
        setDone([`${money(from.currency, value)} moved from ${from.title} to ${to.title}`, "Instant and free"]);
      }
      setAskPin(false);
      ["cards", "transactions", "issued-cards"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      setAskPin(false);
      toast({ title: needsTopUp(e) ? "Top up first" : "Couldn't move money", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <WalletPicker label="FROM" wallets={wallets} value={fromId} onChange={(id) => { setFromId(id); if (id === toId) setToId(""); }} colors={colors} />
        <View style={st.arrowRow}><View style={[st.arrow, { backgroundColor: colors.primaryLight }]}><Ionicons name="arrow-down" size={18} color={colors.primary} /></View></View>
        <WalletPicker label="TO" wallets={wallets} value={toId} onChange={setToId} colors={colors} exclude={fromId} />
      </View>
      {from && balance <= 0 && <TopUpNudge colors={colors} router={router} text={`${from.title} is empty. Top up or choose another wallet.`} />}
      {from && (
        <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AmountField value={amount} onChange={setAmount} currency={from.currency} colors={colors} max={balance} />
          {convert && (
            <View style={[st.quote, { backgroundColor: colors.primaryLight }]}>
              {quoting ? <ActivityIndicator color={colors.primary} /> : quote ? (
                <>
                  <Row k="You get" v={money(quote.to, quote.receive)} colors={colors} strong />
                  <Row k="Rate" v={`1 ${quote.from} = ${Number(quote.rate).toFixed(4)} ${quote.to}`} colors={colors} />
                  <Row k="Conversion margin" v={`${quote.spreadPercent}% (${money(quote.to, quote.spread)})`} colors={colors} />
                </>
              ) : <Text style={[st.muted, { color: colors.textMuted }]}>Enter an amount to see today's rate.</Text>}
            </View>
          )}
          {!convert && to && <Text style={[st.muted, { color: colors.textMuted }]}>Between your own {from.currency} wallets: instant, no fee.</Text>}
          <TouchableOpacity disabled={!!problem} onPress={() => setAskPin(true)} accessibilityRole="button"
            style={[st.btn, { backgroundColor: problem ? colors.border : colors.primary }]}>
            <Text style={[st.btnText, problem && { color: colors.textMuted }]}>{problem ?? (convert ? "Convert" : "Move money")}</Text>
          </TouchableOpacity>
        </View>
      )}
      <PinPrompt visible={askPin} title="Confirm with your PIN" subtitle={from && to ? `${money(from.currency, value)} → ${to.title}` : undefined}
        onCancel={() => setAskPin(false)} onSubmit={submit} />
    </View>
  );
}

function Row({ k, v, colors, strong }: { k: string; v: string; colors: any; strong?: boolean }) {
  return (
    <View style={st.kv}>
      <Text style={[st.muted, { color: colors.textMuted }]}>{k}</Text>
      <Text style={[strong ? st.label : st.muted, { color: colors.text }]}>{v}</Text>
    </View>
  );
}

/* ─── Withdraw ──────────────────────────────────────────────────────────── */

const ACCOUNT_TYPES: BankDetails["accountType"][] = ["savings", "current", "transmission"];
const MIN_WITHDRAW = 50;

function Withdraw({ wallets, colors, router }: { wallets: Wallet[]; colors: any; router: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const rail = useQuery({ queryKey: ["bank-rail"], queryFn: bankRailStatus, staleTime: 60_000 });
  const banks = useQuery({ queryKey: ["banks"], queryFn: fetchBanks, staleTime: 3_600_000 });
  const zar = useMemo(() => wallets.filter((w) => w.currency === "ZAR"), [wallets]);
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<BankDetails["accountType"]>("savings");
  const [pickBank, setPickBank] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  useEffect(() => { if (!walletId && zar.length) setWalletId((zar.find((w) => w.isDefault) ?? zar[0]).id); }, [zar.length]);
  useEffect(() => {
    savedBank().then((b) => {
      if (!b) return;
      setBank({ id: b.bankId, name: b.bankName }); setAccountNumber(b.accountNumber); setAccountName(b.accountName); setAccountType(b.accountType);
    });
  }, []);

  if (rail.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  if (!rail.data?.configured) {
    return (
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[st.navIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name="time-outline" size={22} color={colors.primary} /></View>
        <Text style={[st.label, { color: colors.text }]}>Bank withdrawals are switching on soon</Text>
        <Text style={[st.muted, { color: colors.textMuted }]}>We're finishing the connection with our banking partner. Your money is safe in your wallet, and you can still spend it with your Visa card, pay by QR, or send it to anyone on BukkaPay.</Text>
        <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={() => rail.refetch()}><Text style={st.btnText}>Check again</Text></TouchableOpacity>
      </View>
    );
  }
  if (!zar.length) {
    return (
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.label, { color: colors.text }]}>Withdrawals pay out in rand</Text>
        <Text style={[st.muted, { color: colors.textMuted }]}>Open a ZAR wallet, or convert money into one under "My wallets", to withdraw to a South African bank.</Text>
      </View>
    );
  }
  if (done) return <Done colors={colors} router={router} title="Withdrawal on its way" lines={done} onAgain={() => { setDone(null); setAmount(""); }} />;

  const wallet = zar.find((w) => w.id === walletId);
  const value = Number(amount || 0);
  const balance = Number(wallet?.balance || 0);
  const acctOk = /^\d{6,16}$/.test(accountNumber);
  const problem = !wallet ? "Choose a wallet"
    : value < MIN_WITHDRAW ? `Minimum withdrawal is R${MIN_WITHDRAW}`
    : value > balance ? `You have ${money("ZAR", balance)} available`
    : !bank ? "Choose your bank"
    : !acctOk ? "Enter a valid account number"
    : accountName.trim().length < 2 ? "Enter the account holder's name"
    : null;

  const submit = async (pin: string) => {
    const details: BankDetails = { bankId: bank!.id, bankName: bank!.name, accountNumber, accountName: accountName.trim(), accountType };
    try {
      const r = await withdrawToBank(wallet!.id, value.toFixed(2), details, pin);
      await rememberBank(details);
      setAskPin(false);
      setDone([`${money("ZAR", value)} to ${bank!.name} ${maskAccount(accountNumber)}`,
        r.fee && Number(r.fee) > 0 ? `Fee ${money("ZAR", r.fee)}` : "No fee",
        r.message || "Usually arrives the same day; at most 1–2 business days."]);
      ["cards", "transactions"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      setAskPin(false);
      toast({ title: needsTopUp(e) ? "Not enough money" : "Withdrawal didn't go through", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {zar.length > 1 && <WalletPicker label="FROM" wallets={zar} value={walletId} onChange={setWalletId} colors={colors} />}
        {wallet && balance <= 0 && <TopUpNudge colors={colors} router={router} text="This wallet is empty, so there's nothing to withdraw yet." />}
        <AmountField value={amount} onChange={setAmount} currency="ZAR" colors={colors} max={balance} />
        <Text style={[st.muted, { color: colors.textMuted }]}>Available {money("ZAR", balance)} · minimum R{MIN_WITHDRAW}</Text>
      </View>

      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.fieldLabel, { color: colors.textMuted }]}>TO BANK ACCOUNT</Text>
        <TouchableOpacity onPress={() => setPickBank((v) => !v)} style={[st.input, st.selectRow, { borderColor: colors.border }]} accessibilityRole="button">
          <Ionicons name="business-outline" size={18} color={colors.textMuted} />
          <Text style={{ flex: 1, color: bank ? colors.text : colors.textMuted, fontSize: 15 }}>{bank?.name ?? "Choose your bank"}</Text>
          <Ionicons name={pickBank ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {pickBank && (
          <View style={[st.bankList, { borderColor: colors.border }]}>
            {(banks.data || []).map((b) => (
              <TouchableOpacity key={b.id} onPress={() => { setBank(b); setPickBank(false); }} style={st.bankRow}>
                <Text style={{ color: colors.text, fontSize: 15 }}>{b.name}</Text>
                {bank?.id === b.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput value={accountNumber} onChangeText={(t) => setAccountNumber(t.replace(/\D/g, "").slice(0, 16))} keyboardType="number-pad"
          placeholder="Account number" placeholderTextColor={colors.textMuted} style={[st.input, { borderColor: colors.border, color: colors.text }]} accessibilityLabel="Account number" />
        <TextInput value={accountName} onChangeText={setAccountName} placeholder="Account holder name" placeholderTextColor={colors.textMuted}
          style={[st.input, { borderColor: colors.border, color: colors.text }]} accessibilityLabel="Account holder name" autoCapitalize="words" />
        <View style={st.typeRow}>
          {ACCOUNT_TYPES.map((t) => (
            <TouchableOpacity key={t} onPress={() => setAccountType(t)} style={[st.typeChip, { borderColor: accountType === t ? colors.primary : colors.border, backgroundColor: accountType === t ? colors.primaryLight : "transparent" }]}>
              <Text style={{ color: accountType === t ? colors.primary : colors.textSecondary, fontWeight: "600", textTransform: "capitalize" }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[st.muted, { color: colors.textMuted }]}>Paid out through Stitch. Only send to an account in your own name.</Text>
      </View>

      <TouchableOpacity disabled={!!problem} onPress={() => setAskPin(true)} accessibilityRole="button"
        style={[st.btn, { backgroundColor: problem ? colors.border : colors.primary }]}>
        <Text style={[st.btnText, problem && { color: colors.textMuted }]}>{problem ?? `Withdraw ${money("ZAR", value)}`}</Text>
      </TouchableOpacity>
      <PinPrompt visible={askPin} title="Confirm withdrawal" subtitle={bank ? `${money("ZAR", value)} to ${bank.name} ${maskAccount(accountNumber)}` : undefined}
        onCancel={() => setAskPin(false)} onSubmit={submit} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 16 },
  header: { paddingTop: Platform.OS === "ios" ? 56 : 44 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 2 },
  segment: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  segText: { fontWeight: "700", fontSize: 13 },
  panel: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  navIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  walletChip: { width: 140, borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 2 },
  chipCcy: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chipTitle: { fontSize: 14, fontWeight: "600" },
  chipBal: { fontSize: 15, fontWeight: "800", marginTop: 4 },
  arrowRow: { alignItems: "center" },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  amountBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, gap: 6 },
  amountSym: { fontSize: 22, fontWeight: "700" },
  amountInput: { flex: 1, fontSize: 28, fontWeight: "800", paddingVertical: 12 },
  maxBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  quote: { borderRadius: 12, padding: 12, gap: 6 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", flex: 1 },
  btnRow: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
  btnGhost: { borderWidth: 1 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  doneTitle: { fontSize: 20, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  selectRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bankList: { borderWidth: 1, borderRadius: 12, maxHeight: 260, overflow: "hidden" },
  bankRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
});
