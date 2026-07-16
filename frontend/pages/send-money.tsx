import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { transfer, fetchCards, fetchContacts } from "../lib/api";
import { useCurrency } from "../lib/CurrencyContext";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const NUMPAD = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

type Stage = "recipient" | "amount" | "confirm" | "success";

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function SendMoney() {
  const router = useRouter();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const { colors, darkMode } = useTheme();

  const [stage, setStage] = useState<Stage>("recipient");
  const [tab, setTab] = useState<"contacts" | "id">("contacts");
  const [search, setSearch] = useState("");
  const [manualId, setManualId] = useState("");
  const [recipient, setRecipient] = useState<{ name: string; username: string; color?: string } | null>(null);
  const [amount, setAmount] = useState("0");
  const [selectedCardId, setSelectedCardId] = useState("");
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

  const handleNumpad = (key: string) => {
    if (key === "⌫") { setAmount(p => p.length <= 1 ? "0" : p.slice(0, -1)); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(p => p + "."); return; }
    if (amount.includes(".") && amount.split(".")[1]?.length >= 2) return;
    setAmount(p => p === "0" ? key : p + key);
  };

  const handleSelectContact = (contact: any) => {
    setRecipient({ name: contact.name, username: contact.username, color: contact.color });
    setStage("amount");
  };

  const handleManualContinue = () => {
    if (!manualId.trim()) {
      toast({ title: "Enter a wallet ID or username", variant: "destructive" });
      return;
    }
    setRecipient({ name: manualId, username: manualId.replace("@", "") });
    setStage("amount");
  };

  const handleAmountContinue = () => {
    if (parseFloat(amount) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setStage("confirm");
  };

  const handleSend = async () => {
    if (!recipient || !selectedCardId) return;
    setSending(true);
    try {
      await transfer(selectedCardId, recipient.username, amount);
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
          <Text style={s.headerTitle}>Send Money</Text>
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
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {contactsLoading ? (
              <ActivityIndicator size="large" color={PRIMARY} style={{ marginTop: 60 }} />
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listContent}>
                {filteredContacts.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <View style={[s.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                      <Ionicons name="people-outline" size={36} color={colors.primary} />
                    </View>
                    <Text style={[s.emptyTitle, { color: colors.text }]}>
                      {search ? "No contacts found" : "No BukkaPay contacts yet"}
                    </Text>
                    <Text style={[s.emptySub, { color: colors.textMuted }]}>
                      {search ? "Try a different name or username" : "Add contacts from the contacts page, or use the Enter ID tab to send manually"}
                    </Text>
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
                        <View style={s.contactMeta}>
                          <View style={s.bkkBadge}>
                            <Text style={s.bkkBadgeText}>BukkaPay</Text>
                          </View>
                          <Text style={[s.contactUsername, { color: colors.textMuted }]}>@{contact.username}</Text>
                        </View>
                      </View>
                      <View style={[s.arrowBox, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="arrow-forward" size={16} color={PRIMARY} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </>
        ) : (
          <ScrollView contentContainerStyle={s.idContent}>
            <View style={[s.idCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.idIconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="wallet-outline" size={32} color={PRIMARY} />
              </View>
              <Text style={[s.idCardTitle, { color: colors.text }]}>Send to Wallet ID</Text>
              <Text style={[s.idCardSub, { color: colors.textMuted }]}>
                Enter the BukkaPay username or wallet ID of the person you want to pay
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

            <View style={[s.securityRow, { backgroundColor: darkMode ? "#1F2937" : "#F0FDF4" }]}>
              <Ionicons name="shield-checkmark" size={16} color={GREEN} />
              <Text style={[s.securityText, { color: darkMode ? "#6EE7B7" : "#065F46" }]}>
                Only BukkaPay users — instant, secure transfers
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Amount ─────────────────────────────────────────────────────────────────
  if (stage === "amount") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => setStage("recipient")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Enter Amount</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Recipient pill */}
        <View style={[s.recipientPill, { backgroundColor: colors.primaryLight }]}>
          <View style={[s.pillAvatar, { backgroundColor: recipient?.color || PRIMARY }]}>
            <Text style={s.pillAvatarText}>{initials(recipient?.name || "?")}</Text>
          </View>
          <View>
            <Text style={[s.pillName, { color: colors.text }]}>{recipient?.name}</Text>
            <Text style={[s.pillUsername, { color: colors.textMuted }]}>@{recipient?.username}</Text>
          </View>
          <TouchableOpacity onPress={() => setStage("recipient")} style={s.pillChange}>
            <Text style={[s.pillChangeText, { color: PRIMARY }]}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Card selector */}
        {cardsLoading ? (
          <ActivityIndicator color={PRIMARY} style={{ marginTop: 12 }} />
        ) : (cards as any[]).length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.cardScroll} contentContainerStyle={s.cardScrollInner}>
            {(cards as any[]).map((card: any) => (
              <TouchableOpacity
                key={card.id}
                style={[s.cardChip, { borderColor: colors.border, backgroundColor: colors.surface },
                  selectedCardId === card.id && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
                onPress={() => setSelectedCardId(card.id)}
              >
                <Ionicons name="card" size={13} color={selectedCardId === card.id ? "#fff" : colors.textMuted} />
                <Text style={[s.cardChipText, { color: selectedCardId === card.id ? "#fff" : colors.textSecondary }]}>
                  {card.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : selectedCard ? (
          <View style={[s.singleCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="card-outline" size={15} color={PRIMARY} />
            <Text style={[s.singleCardText, { color: colors.textSecondary }]}>
              {selectedCard.title} · Balance {currency.symbol}{parseFloat(selectedCard.balance).toFixed(2)}
            </Text>
          </View>
        ) : null}

        {/* Amount display */}
        <View style={s.amountDisplay}>
          <Text style={[s.amountSym, { color: PRIMARY }]}>{currency.symbol}</Text>
          <Text style={[s.amountVal, { color: colors.text }]}>{amount}</Text>
        </View>

        {/* Numpad */}
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
            style={[s.continueBtn, (parseFloat(amount) <= 0 || !selectedCardId) && { opacity: 0.4 }]}
            onPress={handleAmountContinue}
            disabled={parseFloat(amount) <= 0 || !selectedCardId}
          >
            <Text style={s.continueBtnText}>Review Payment</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (stage === "confirm") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={() => setStage("amount")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Confirm Payment</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.confirmContent}>
          {/* Big amount card */}
          <View style={[s.confirmCard, { backgroundColor: colors.card }]}>
            <Text style={[s.confirmAmountLabel, { color: colors.textMuted }]}>You're sending</Text>
            <Text style={[s.confirmAmount, { color: PRIMARY }]}>{currency.symbol}{amount}</Text>

            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />

            <View style={s.confirmRecipientRow}>
              <View style={[s.avatar, { backgroundColor: recipient?.color || PRIMARY }]}>
                <Text style={s.avatarText}>{initials(recipient?.name || "?")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.confirmRecipientName, { color: colors.text }]}>{recipient?.name}</Text>
                <Text style={[s.confirmRecipientSub, { color: colors.textMuted }]}>@{recipient?.username} · BukkaPay Wallet</Text>
              </View>
            </View>

            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />

            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>From card</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>{selectedCard?.title}</Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Available</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>
                {currency.symbol}{parseFloat(selectedCard?.balance || "0").toFixed(2)}
              </Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Arrives</Text>
              <Text style={[s.confirmValue, { color: GREEN }]}>Instantly</Text>
            </View>
          </View>

          <View style={[s.securityRow, { backgroundColor: darkMode ? "#1F2937" : "#F0FDF4", marginTop: 0 }]}>
            <Ionicons name="lock-closed" size={14} color={GREEN} />
            <Text style={[s.securityText, { color: darkMode ? "#6EE7B7" : "#065F46" }]}>
              End-to-end encrypted · Instant settlement
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
                  <Text style={s.sendBtnText}>Send {currency.symbol}{amount}</Text>
                </>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStage("amount")} style={[s.editBtn, { borderColor: colors.border }]}>
            <Text style={[s.editBtnText, { color: colors.textSecondary }]}>Edit amount</Text>
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
        <Text style={[s.successAmount, { color: PRIMARY }]}>{currency.symbol}{amount}</Text>
        <Text style={[s.successTo, { color: colors.textMuted }]}>sent to {recipient?.name}</Text>

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

  tabRow: {
    flexDirection: "row", borderBottomWidth: 1,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabTextActive: { fontWeight: "700" },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    margin: 16, marginBottom: 8,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15 },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },
  emptyWrap: { alignItems: "center", paddingTop: 48, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 20 },

  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 16, borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  contactName: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  contactMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  bkkBadge: { backgroundColor: "rgba(124,58,237,0.12)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bkkBadgeText: { fontSize: 10, fontWeight: "700", color: "#7C3AED" },
  contactUsername: { fontSize: 12 },
  arrowBox: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  idContent: { padding: 20, gap: 16 },
  idCard: {
    borderRadius: 20, padding: 24, alignItems: "center",
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  idIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  idCardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  idCardSub: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  idInput: {
    width: "100%", borderWidth: 1.5, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 16,
  },

  securityRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginTop: 4,
  },
  securityText: { fontSize: 13, fontWeight: "500" },

  recipientPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  pillAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pillAvatarText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  pillName: { fontSize: 14, fontWeight: "700" },
  pillUsername: { fontSize: 12 },
  pillChange: { marginLeft: "auto" },
  pillChangeText: { fontSize: 13, fontWeight: "700" },

  cardScroll: { marginTop: 8 },
  cardScrollInner: { paddingHorizontal: 16, gap: 8, height: 40, alignItems: "center" },
  cardChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
  },
  cardChipText: { fontSize: 12, fontWeight: "700" },

  singleCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  singleCardText: { fontSize: 13, fontWeight: "500" },

  amountDisplay: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "center",
    paddingVertical: 24,
  },
  amountSym: { fontSize: 32, fontWeight: "700", marginRight: 4 },
  amountVal: { fontSize: 56, fontWeight: "800", letterSpacing: -2 },

  numpad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, gap: 10 },
  numKey: {
    width: "30%", height: 60, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  numKeyText: { fontSize: 22, fontWeight: "600" },

  amountFooter: { padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 20 },

  continueBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  continueBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },

  confirmContent: { padding: 20, paddingBottom: 40, gap: 14 },
  confirmCard: {
    borderRadius: 20, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  confirmAmountLabel: { fontSize: 14, fontWeight: "500", textAlign: "center", marginBottom: 6 },
  confirmAmount: { fontSize: 44, fontWeight: "900", textAlign: "center", letterSpacing: -1 },
  confirmDivider: { height: 1, marginVertical: 16 },
  confirmRecipientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  confirmRecipientName: { fontSize: 16, fontWeight: "700" },
  confirmRecipientSub: { fontSize: 12, marginTop: 2 },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  confirmLabel: { fontSize: 14 },
  confirmValue: { fontSize: 14, fontWeight: "600" },

  sendBtn: {
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  sendBtnText: { fontSize: 18, fontWeight: "700", color: "#fff" },

  editBtn: {
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
  },
  editBtnText: { fontSize: 15, fontWeight: "600" },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: GREEN, alignItems: "center", justifyContent: "center",
    marginBottom: 24,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  successTitle: { fontSize: 28, fontWeight: "900", marginBottom: 8 },
  successAmount: { fontSize: 40, fontWeight: "900", letterSpacing: -1, marginBottom: 8 },
  successTo: { fontSize: 16, marginBottom: 40 },
  doneBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40,
  },
  doneBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
