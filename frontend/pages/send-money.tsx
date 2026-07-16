import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { sendMoney, getTransferQuote, fetchCards, fetchContacts } from "../lib/api";
import { AFRICA_COUNTRIES, INTERNATIONAL_COUNTRIES, Country, groupByRegion } from "../lib/countries";
import { TRANSFER_CATEGORIES, getCategory } from "../lib/categories";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const NUMPAD = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

type Stage = "recipient" | "category" | "subcategory" | "destination" | "country" | "amount" | "confirm" | "success";
type DestinationTab = "local" | "africa" | "international";

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function SendMoney() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();

  const [stage, setStage] = useState<Stage>("recipient");
  const [tab, setTab] = useState<"contacts" | "id">("contacts");
  const [search, setSearch] = useState("");
  const [manualId, setManualId] = useState("");
  const [recipient, setRecipient] = useState<{ name: string; username: string; color?: string } | null>(null);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  const [destinationTab, setDestinationTab] = useState<DestinationTab | null>(null);
  const [country, setCountry] = useState<Country | null>(null);

  const [amount, setAmount] = useState("0");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
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
  const destinationCurrency = destinationTab === "local" || !country ? selectedCard?.currency : country.currency;

  const handleSelectContact = (contact: any) => {
    setRecipient({ name: contact.name, username: contact.username, color: contact.color });
    setStage("category");
  };

  const handleManualContinue = () => {
    if (!manualId.trim()) {
      toast({ title: "Enter a wallet ID or username", variant: "destructive" });
      return;
    }
    setRecipient({ name: manualId, username: manualId.replace("@", "") });
    setStage("category");
  };

  const handleSelectCategory = (id: string) => {
    setCategoryId(id);
    setSubcategory(null);
    const cat = getCategory(id);
    setStage(cat && cat.subcategories.length > 0 ? "subcategory" : "destination");
  };

  const handleSelectDestinationTab = (t: DestinationTab) => {
    setDestinationTab(t);
    if (t === "local") {
      setCountry(null);
      setStage("amount");
    } else {
      setStage("country");
    }
  };

  const handleSelectCountry = (c: Country) => {
    setCountry(c);
    setStage("amount");
  };

  const handleNumpad = (key: string) => {
    if (key === "⌫") { setAmount(p => p.length <= 1 ? "0" : p.slice(0, -1)); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(p => p + "."); return; }
    if (amount.includes(".") && amount.split(".")[1]?.length >= 2) return;
    setAmount(p => p === "0" ? key : p + key);
  };

  const handleReviewQuote = async () => {
    if (!selectedCard || parseFloat(amount) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setQuoting(true);
    try {
      const q = await getTransferQuote(selectedCard.currency, destinationCurrency, amount);
      setQuote(q);
      setStage("confirm");
    } catch (e: any) {
      toast({ title: "Could not get a quote", description: e.message, variant: "destructive" });
    } finally {
      setQuoting(false);
    }
  };

  const handleSend = async () => {
    if (!recipient || !selectedCardId) return;
    setSending(true);
    try {
      await sendMoney(selectedCardId, recipient.username, amount, {
        destinationCountryCode: country?.code,
        purposeCategory: categoryId || undefined,
        purposeSubcategory: subcategory || undefined,
      });
      setStage("success");
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const header = (title: string, onBack: () => void) => (
    <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
      <TouchableOpacity onPress={onBack} style={s.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // ── Recipient ──────────────────────────────────────────────────────────────
  if (stage === "recipient") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Send Money", () => router.back())}

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
              <Text style={[s.idCardTitle, { color: colors.text }]}>Send to BKP ID</Text>
              <Text style={[s.idCardSub, { color: colors.textMuted }]}>
                Enter the BukkaPay username or wallet ID (BKP ID) of the person you want to pay
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

  // ── Category ───────────────────────────────────────────────────────────────
  if (stage === "category") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("What's this for?", () => setStage("recipient"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {TRANSFER_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[s.categoryRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelectCategory(cat.id)}
              activeOpacity={0.75}
            >
              <View style={[s.categoryIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={cat.icon as any} size={20} color={PRIMARY} />
              </View>
              <Text style={[s.categoryLabel, { color: colors.text }]}>{cat.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Sub-category ─────────────────────────────────────────────────────────────
  if (stage === "subcategory") {
    const cat = getCategory(categoryId || "");
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header(cat?.label || "Details", () => setStage("category"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {(cat?.subcategories || []).map((sub) => (
            <TouchableOpacity
              key={sub}
              style={[s.categoryRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSubcategory(sub); setStage("destination"); }}
              activeOpacity={0.75}
            >
              <Text style={[s.categoryLabel, { color: colors.text, marginLeft: 0 }]}>{sub}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Destination (Local / Africa / International) ────────────────────────────
  if (stage === "destination") {
    const options: { id: DestinationTab; label: string; sub: string; icon: string }[] = [
      { id: "local", label: "Local", sub: `Send instantly in ${selectedCard?.currency || "your currency"}`, icon: "home-outline" },
      { id: "africa", label: "Africa", sub: "Send to any BukkaPay user across Africa", icon: "earth-outline" },
      { id: "international", label: "International", sub: "Send worldwide, wherever BukkaPay is used", icon: "globe-outline" },
    ];
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Send Money", () => setStage(getCategory(categoryId || "")?.subcategories.length ? "subcategory" : "category"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Text style={[s.sectionLabel, { color: colors.text }]}>Where's the recipient?</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[s.destinationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelectDestinationTab(opt.id)}
              activeOpacity={0.75}
            >
              <View style={[s.categoryIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={opt.icon as any} size={22} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.destinationTitle, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[s.destinationSub, { color: colors.textMuted }]}>{opt.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Country picker (Africa / International) ──────────────────────────────────
  if (stage === "country") {
    const list = destinationTab === "africa" ? AFRICA_COUNTRIES : INTERNATIONAL_COUNTRIES;
    const grouped = destinationTab === "international" ? groupByRegion(list) : [{ region: "Africa", countries: list }];
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header(destinationTab === "africa" ? "Africa" : "International", () => setStage("destination"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          {grouped.map((g) => (
            <View key={g.region}>
              {destinationTab === "international" && (
                <Text style={[s.sectionLabel, { color: colors.textMuted, marginBottom: 8 }]}>{g.region}</Text>
              )}
              <View style={{ gap: 8 }}>
                {g.countries.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.countryChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => handleSelectCountry(c)}
                  >
                    <Text style={s.countryFlag}>{c.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.countryName, { color: colors.text }]}>{c.name}</Text>
                      <Text style={[s.countryCurrency, { color: colors.textMuted }]}>Wallet in {c.currency}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Amount ─────────────────────────────────────────────────────────────────
  if (stage === "amount") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Enter Amount", () => setStage(destinationTab === "local" ? "destination" : "country"))}

        <View style={[s.recipientPill, { backgroundColor: colors.primaryLight }]}>
          <View style={[s.pillAvatar, { backgroundColor: recipient?.color || PRIMARY }]}>
            <Text style={s.pillAvatarText}>{initials(recipient?.name || "?")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.pillName, { color: colors.text }]}>{recipient?.name}</Text>
            <Text style={[s.pillUsername, { color: colors.textMuted }]}>
              {country ? `${country.flag} ${country.name} · ` : "Local · "}
              {selectedCard?.currency}{destinationCurrency && destinationCurrency !== selectedCard?.currency ? ` → ${destinationCurrency}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setStage(destinationTab === "local" ? "destination" : "country")}>
            <Text style={[s.pillChangeText, { color: PRIMARY }]}>Change</Text>
          </TouchableOpacity>
        </View>

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
              {selectedCard.title} · Balance {getCurrency(selectedCard.currency).symbol}{parseFloat(selectedCard.balance).toFixed(2)}
            </Text>
          </View>
        ) : null}

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
            style={[s.continueBtn, (parseFloat(amount) <= 0 || !selectedCardId || quoting) && { opacity: 0.4 }]}
            onPress={handleReviewQuote}
            disabled={parseFloat(amount) <= 0 || !selectedCardId || quoting}
          >
            {quoting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={s.continueBtnText}>Review Payment</Text>
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
    const sameCurrency = quote.sourceCurrency === quote.destinationCurrency;
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Confirm Payment", () => setStage("amount"))}

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
                <Text style={[s.confirmRecipientSub, { color: colors.textMuted }]}>
                  {country ? `${country.flag} ${country.name}` : "Local · BukkaPay Wallet"}
                </Text>
              </View>
            </View>

            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />

            {(categoryId || subcategory) && (
              <View style={s.confirmRow}>
                <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Purpose</Text>
                <Text style={[s.confirmValue, { color: colors.text }]}>
                  {getCategory(categoryId || "")?.label}{subcategory ? ` · ${subcategory}` : ""}
                </Text>
              </View>
            )}
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
            {!sameCurrency && (
              <View style={s.confirmRow}>
                <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Exchange rate</Text>
                <Text style={[s.confirmValue, { color: colors.text }]}>
                  1 {quote.sourceCurrency} = {parseFloat(quote.exchangeRate).toFixed(4)} {quote.destinationCurrency}
                </Text>
              </View>
            )}
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
                  <Text style={s.sendBtnText}>Send {getCurrency(quote.sourceCurrency).symbol}{quote.sourceAmount}</Text>
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
        <Text style={[s.successAmount, { color: PRIMARY }]}>
          {quote ? `${getCurrency(quote.sourceCurrency).symbol}${quote.sourceAmount}` : ""}
        </Text>
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

  sectionLabel: { fontSize: 15, fontWeight: "700" },

  categoryRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 16,
    borderRadius: 16, borderWidth: 1.5,
  },
  categoryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryLabel: { flex: 1, fontSize: 15, fontWeight: "600", marginLeft: 2 },

  destinationCard: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
    borderRadius: 16, borderWidth: 1.5,
  },
  destinationTitle: { fontSize: 16, fontWeight: "700" },
  destinationSub: { fontSize: 12, marginTop: 3 },

  countryChip: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1.5, padding: 12,
  },
  countryFlag: { fontSize: 24 },
  countryName: { fontSize: 14, fontWeight: "700" },
  countryCurrency: { fontSize: 11, marginTop: 2 },

  recipientPill: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  pillAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pillAvatarText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  pillName: { fontSize: 14, fontWeight: "700" },
  pillUsername: { fontSize: 12 },
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
