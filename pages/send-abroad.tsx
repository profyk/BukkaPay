import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { sendInternational, getTransferQuote, fetchCards, fetchContacts } from "../lib/api";
import { COUNTRIES, Country } from "../lib/countries";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const NUMPAD = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

type Stage = "recipient" | "destination" | "amount" | "confirm" | "success";

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function SendAbroad() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();

  const [stage, setStage] = useState<Stage>("recipient");
  const [tab, setTab] = useState<"contacts" | "id">("contacts");
  const [search, setSearch] = useState("");
  const [manualId, setManualId] = useState("");
  const [recipient, setRecipient] = useState<{ name: string; username: string; color?: string } | null>(null);

  const [country, setCountry] = useState<Country | null>(null);
  const [selectedCardId, setSelectedCardId] = useState("");

  const [amount, setAmount] = useState("0");
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [sending, setSending] = useState(false);

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
  });

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  useEffect(() => {
    const c = cards as any[];
    if (c.length > 0 && !selectedCardId) setSelectedCardId(c[0].id);
  }, [cards]);

  const filteredContacts = search.trim()
    ? (contacts as any[]).filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.username.toLowerCase().includes(search.toLowerCase())
      )
    : (contacts as any[]);

  const selectedCard = (cards as any[]).find(c => c.id === selectedCardId);

  const handleSelectContact = (contact: any) => {
    setRecipient({ name: contact.name, username: contact.username, color: contact.color });
    setStage("destination");
  };

  const handleManualContinue = () => {
    if (!manualId.trim()) {
      toast({ title: "Enter a wallet ID or username", variant: "destructive" });
      return;
    }
    setRecipient({ name: manualId, username: manualId.replace("@", "") });
    setStage("destination");
  };

  const handleDestinationContinue = () => {
    if (!country) {
      toast({ title: "Choose a destination country", variant: "destructive" });
      return;
    }
    if (!selectedCardId) {
      toast({ title: "Choose which wallet to send from", variant: "destructive" });
      return;
    }
    setStage("amount");
  };

  const handleNumpad = (key: string) => {
    if (key === "⌫") { setAmount(p => p.length <= 1 ? "0" : p.slice(0, -1)); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(p => p + "."); return; }
    if (amount.includes(".") && amount.split(".")[1]?.length >= 2) return;
    setAmount(p => p === "0" ? key : p + key);
  };

  const handleReviewQuote = async () => {
    if (!country || !selectedCard || parseFloat(amount) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setQuoting(true);
    setQuoteError("");
    try {
      const q = await getTransferQuote(selectedCard.currency, country.currency, amount);
      setQuote(q);
      setStage("confirm");
    } catch (e: any) {
      setQuoteError(e.message);
      toast({ title: "Could not get a quote", description: e.message, variant: "destructive" });
    } finally {
      setQuoting(false);
    }
  };

  const handleSend = async () => {
    if (!recipient || !selectedCardId || !country) return;
    setSending(true);
    try {
      await sendInternational(selectedCardId, recipient.username, country.currency, amount);
      setStage("success");
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ── Recipient ──────────────────────────────────────────────────────────────
  if (stage === "recipient") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Send Abroad</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[s.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(["contacts", "id"] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && { borderBottomColor: PRIMARY }]}
              onPress={() => setTab(t)}
            >
              <Ionicons name={t === "contacts" ? "people" : "keypad"} size={16} color={tab === t ? PRIMARY : colors.textMuted} />
              <Text style={[s.tabText, { color: tab === t ? PRIMARY : colors.textMuted }, tab === t && s.tabTextActive]}>
                {t === "contacts" ? "My Contacts" : "Enter ID"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "contacts" ? (
          <>
            <View style={[s.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={[s.searchInput, { color: colors.text }]}
                placeholder="Search contacts..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            {contactsLoading ? (
              <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 60 }} />
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent}>
                {filteredContacts.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <Ionicons name="people-outline" size={36} color={colors.primary} />
                    <Text style={[s.emptyTitle, { color: colors.text }]}>No BukkaPay contacts yet</Text>
                    <Text style={[s.emptySub, { color: colors.textMuted }]}>Use the Enter ID tab to send to a specific wallet</Text>
                  </View>
                ) : (
                  filteredContacts.map((contact: any) => (
                    <TouchableOpacity
                      key={contact.id}
                      style={[s.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => handleSelectContact(contact)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.avatar, { backgroundColor: contact.color || PRIMARY }]}>
                        <Text style={s.avatarText}>{initials(contact.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.contactName, { color: colors.text }]}>{contact.name}</Text>
                        <Text style={[s.contactUsername, { color: colors.textMuted }]}>@{contact.username}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={PRIMARY} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </>
        ) : (
          <ScrollView contentContainerStyle={s.idContent}>
            <View style={[s.idCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="globe-outline" size={32} color={PRIMARY} />
              <Text style={[s.idCardTitle, { color: colors.text }]}>Send to Wallet ID</Text>
              <Text style={[s.idCardSub, { color: colors.textMuted }]}>
                Enter the BukkaPay username or wallet ID of the person abroad you want to pay
              </Text>
              <TextInput
                style={[s.idInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="@username or BKP-XXXXXXXX"
                placeholderTextColor={colors.textMuted}
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.continueBtn, !manualId.trim() && { opacity: 0.4 }]}
                onPress={handleManualContinue}
                disabled={!manualId.trim()}
              >
                <Text style={s.continueBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Destination + source wallet ──────────────────────────────────────────────
  if (stage === "destination") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => setStage("recipient")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Where to?</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View>
            <Text style={[s.sectionLabel, { color: colors.text }]}>Destination country</Text>
            <View style={s.countryGrid}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[s.countryChip, { borderColor: colors.border, backgroundColor: colors.surface },
                    country?.code === c.code && { borderColor: PRIMARY, backgroundColor: colors.primaryLight }]}
                  onPress={() => setCountry(c)}
                >
                  <Text style={s.countryFlag}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.countryName, { color: colors.text }]}>{c.name}</Text>
                    <Text style={[s.countryCurrency, { color: colors.textMuted }]}>Receives in {c.currency}</Text>
                  </View>
                  {country?.code === c.code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={[s.sectionLabel, { color: colors.text }]}>Send from</Text>
            {cardsLoading ? (
              <ActivityIndicator color={PRIMARY} />
            ) : (
              <View style={{ gap: 8 }}>
                {(cards as any[]).map((card: any) => (
                  <TouchableOpacity
                    key={card.id}
                    style={[s.cardOption, { borderColor: colors.border, backgroundColor: colors.surface },
                      selectedCardId === card.id && { borderColor: PRIMARY, backgroundColor: colors.primaryLight }]}
                    onPress={() => setSelectedCardId(card.id)}
                  >
                    <Ionicons name="card" size={16} color={selectedCardId === card.id ? PRIMARY : colors.textMuted} />
                    <Text style={[s.cardOptionText, { color: colors.text }]}>{card.title}</Text>
                    <Text style={[s.cardOptionBalance, { color: colors.textMuted }]}>
                      {getCurrency(card.currency).symbol}{parseFloat(card.balance).toFixed(2)} {card.currency}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity style={s.continueBtn} onPress={handleDestinationContinue}>
            <Text style={s.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Amount ─────────────────────────────────────────────────────────────────
  if (stage === "amount") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => setStage("destination")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Enter Amount</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[s.recipientPill, { backgroundColor: colors.primaryLight }]}>
          <Text style={s.pillFlag}>{country?.flag}</Text>
          <View>
            <Text style={[s.pillName, { color: colors.text }]}>{recipient?.name} · {country?.name}</Text>
            <Text style={[s.pillUsername, { color: colors.textMuted }]}>
              From {selectedCard?.title} ({selectedCard?.currency}) → recipient gets {country?.currency}
            </Text>
          </View>
        </View>

        <View style={s.amountDisplay}>
          <Text style={[s.amountSym, { color: PRIMARY }]}>{getCurrency(selectedCard?.currency).symbol}</Text>
          <Text style={[s.amountVal, { color: colors.text }]}>{amount}</Text>
        </View>

        <View style={s.numpad}>
          {NUMPAD.map(key => (
            <TouchableOpacity
              key={key}
              style={[s.numKey, { backgroundColor: colors.card }]}
              onPress={() => handleNumpad(key)}
              activeOpacity={0.55}
            >
              {key === "⌫"
                ? <Ionicons name="backspace" size={22} color={colors.text} />
                : <Text style={[s.numKeyText, { color: colors.text }]}>{key}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={[s.amountFooter, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[s.continueBtn, (parseFloat(amount) <= 0 || quoting) && { opacity: 0.4 }]}
            onPress={handleReviewQuote}
            disabled={parseFloat(amount) <= 0 || quoting}
          >
            {quoting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={s.continueBtnText}>Get Quote</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (stage === "confirm" && quote) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => setStage("amount")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Confirm Transfer</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.confirmContent}>
          <View style={[s.confirmCard, { backgroundColor: colors.card }]}>
            <Text style={[s.confirmAmountLabel, { color: colors.textMuted }]}>Recipient gets</Text>
            <Text style={[s.confirmAmount, { color: PRIMARY }]}>
              {getCurrency(quote.destinationCurrency).symbol}{quote.destinationAmount}
            </Text>

            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />

            <View style={s.confirmRecipientRow}>
              <View style={[s.avatar, { backgroundColor: recipient?.color || PRIMARY }]}>
                <Text style={s.avatarText}>{initials(recipient?.name || "?")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.confirmRecipientName, { color: colors.text }]}>{recipient?.name}</Text>
                <Text style={[s.confirmRecipientSub, { color: colors.textMuted }]}>{country?.flag} {country?.name}</Text>
              </View>
            </View>

            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />

            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>You send</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>
                {getCurrency(quote.sourceCurrency).symbol}{quote.sourceAmount} {quote.sourceCurrency}
              </Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Transfer fee</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>
                {getCurrency(quote.sourceCurrency).symbol}{quote.fee} {quote.sourceCurrency}
              </Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Exchange rate</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>
                1 {quote.sourceCurrency} = {parseFloat(quote.exchangeRate).toFixed(4)} {quote.destinationCurrency}
              </Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Arrives</Text>
              <Text style={[s.confirmValue, { color: GREEN }]}>Instantly</Text>
            </View>
          </View>

          <View style={[s.securityRow, { backgroundColor: darkMode ? "#1F2937" : "#F0FDF4" }]}>
            <Ionicons name="lock-closed" size={14} color={GREEN} />
            <Text style={[s.securityText, { color: darkMode ? "#6EE7B7" : "#065F46" }]}>
              Rate locked in for this transfer · End-to-end encrypted
            </Text>
          </View>

          <TouchableOpacity
            style={[s.sendBtn, sending && { opacity: 0.65 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={s.sendBtnText}>Send {getCurrency(quote.sourceCurrency).symbol}{quote.sourceAmount}</Text>
                </>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={s.successWrap}>
        <View style={s.successCircle}>
          <Ionicons name="checkmark" size={52} color="#fff" />
        </View>
        <Text style={[s.successTitle, { color: colors.text }]}>Sent!</Text>
        <Text style={[s.successAmount, { color: PRIMARY }]}>
          {quote ? `${getCurrency(quote.destinationCurrency).symbol}${quote.destinationAmount}` : ""}
        </Text>
        <Text style={[s.successTo, { color: colors.textMuted }]}>
          on its way to {recipient?.name} in {country?.name}
        </Text>

        <TouchableOpacity style={s.doneBtn} onPress={() => router.push("/(tabs)" as any)}>
          <Text style={s.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingBottom: 18, paddingHorizontal: 20,
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },

  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabTextActive: { fontWeight: "700" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 16, marginBottom: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15 },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },
  emptyWrap: { alignItems: "center", paddingTop: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  contactName: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  contactUsername: { fontSize: 12 },

  idContent: { padding: 20, gap: 16 },
  idCard: { borderRadius: 20, padding: 24, alignItems: "center", borderWidth: 1.5, gap: 8 },
  idCardTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  idCardSub: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 12 },
  idInput: { width: "100%", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 16 },

  sectionLabel: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  countryGrid: { gap: 8 },
  countryChip: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5,
  },
  countryFlag: { fontSize: 24 },
  countryName: { fontSize: 14, fontWeight: "700" },
  countryCurrency: { fontSize: 12, marginTop: 1 },

  cardOption: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5,
  },
  cardOptionText: { fontSize: 14, fontWeight: "600", flex: 1 },
  cardOptionBalance: { fontSize: 12 },

  recipientPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  pillFlag: { fontSize: 22 },
  pillName: { fontSize: 14, fontWeight: "700" },
  pillUsername: { fontSize: 12, marginTop: 2 },

  amountDisplay: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", paddingVertical: 24 },
  amountSym: { fontSize: 32, fontWeight: "700", marginRight: 4 },
  amountVal: { fontSize: 56, fontWeight: "800", letterSpacing: -2 },

  numpad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, gap: 10 },
  numKey: {
    width: "30%", height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center",
  },
  numKeyText: { fontSize: 22, fontWeight: "600" },

  amountFooter: { padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 20 },

  continueBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  continueBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },

  confirmContent: { padding: 20, paddingBottom: 40, gap: 14 },
  confirmCard: { borderRadius: 20, padding: 20 },
  confirmAmountLabel: { fontSize: 14, fontWeight: "500", textAlign: "center", marginBottom: 6 },
  confirmAmount: { fontSize: 40, fontWeight: "900", textAlign: "center", letterSpacing: -1 },
  confirmDivider: { height: 1, marginVertical: 16 },
  confirmRecipientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirmRecipientName: { fontSize: 16, fontWeight: "700" },
  confirmRecipientSub: { fontSize: 12, marginTop: 2 },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  confirmLabel: { fontSize: 14 },
  confirmValue: { fontSize: 14, fontWeight: "600" },

  securityRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  securityText: { fontSize: 13, fontWeight: "500" },

  sendBtn: {
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  sendBtnText: { fontSize: 18, fontWeight: "700", color: "#fff" },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: GREEN,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  successTitle: { fontSize: 28, fontWeight: "900", marginBottom: 8 },
  successAmount: { fontSize: 40, fontWeight: "900", letterSpacing: -1, marginBottom: 8 },
  successTo: { fontSize: 16, marginBottom: 40, textAlign: "center" },
  doneBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40 },
  doneBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
