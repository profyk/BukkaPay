import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

interface AppItem {
  id: string;
  category: string;
  title: string;
  description: string;
  keywords: string[];
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  route: string;
}

const ALL_ITEMS: AppItem[] = [
  // ── Payments ──────────────────────────────────────────────
  {
    id: "send-money", category: "Payments",
    title: "Send Money", description: "Send funds to BukkaPay users, mobile wallets or bank accounts",
    keywords: ["send", "transfer", "money", "pay", "wallet", "bank"],
    icon: "paper-plane-outline", iconBg: "#EFF6FF", iconColor: "#2563EB",
    route: "/(screens)/send-money",
  },
  {
    id: "send-to-anyone", category: "Payments",
    title: "Send to Anyone", description: "Send to any phone number or email, even outside BukkaPay",
    keywords: ["send", "anyone", "phone", "email", "external"],
    icon: "share-outline", iconBg: "#F0FDF4", iconColor: "#059669",
    route: "/(screens)/send-to-anyone",
  },
  {
    id: "request", category: "Payments",
    title: "Request Money", description: "Ask contacts or anyone to send you money",
    keywords: ["request", "ask", "receive", "money", "invoice"],
    icon: "arrow-undo-outline", iconBg: "#FFF7ED", iconColor: "#EA580C",
    route: "/(screens)/request",
  },
  {
    id: "topup", category: "Payments",
    title: "Top Up Wallet", description: "Add money to your BukkaPay wallet balance",
    keywords: ["top up", "topup", "load", "deposit", "add funds", "recharge"],
    icon: "add-circle-outline", iconBg: "#F0FDF4", iconColor: "#16A34A",
    route: "/(screens)/topup",
  },
  {
    id: "qr-pay", category: "Payments",
    title: "QR Code Pay", description: "Scan a QR code to pay instantly",
    keywords: ["qr", "scan", "code", "pay", "camera"],
    icon: "qr-code-outline", iconBg: "#F5F3FF", iconColor: "#7C3AED",
    route: "/(screens)/qr-pay",
  },
  {
    id: "scan-pay", category: "Payments",
    title: "Scan & Pay", description: "Scan a QR code and pay instantly at checkout",
    keywords: ["scan", "pay", "checkout", "qr", "business"],
    icon: "scan-outline", iconBg: "#EFF6FF", iconColor: "#3B82F6",
    route: "/(screens)/scan-pay",
  },
  {
    id: "tap-pay", category: "Payments",
    title: "Tap to Pay", description: "Pay with NFC by tapping your phone",
    keywords: ["tap", "nfc", "contactless", "pay", "phone"],
    icon: "phone-portrait-outline", iconBg: "#FFF7ED", iconColor: "#F59E0B",
    route: "/(screens)/tap-pay",
  },
  {
    id: "pay-rent", category: "Payments",
    title: "Pay Rent", description: "Pay your rent directly through BukkaPay",
    keywords: ["rent", "landlord", "pay", "housing", "property"],
    icon: "home-outline", iconBg: "#FFF1F2", iconColor: "#E11D48",
    route: "/(screens)/pay-rent",
  },

  // ── Payment Links ──────────────────────────────────────────
  {
    id: "payment-links", category: "Payment Links",
    title: "My Payment Links", description: "View, manage and track all your payment links",
    keywords: ["payment link", "links", "received", "sent", "manage"],
    icon: "link-outline", iconBg: "#F5F3FF", iconColor: "#7C3AED",
    route: "/(screens)/payment-links",
  },
  {
    id: "create-payment-link", category: "Payment Links",
    title: "Create Payment Link", description: "Generate a shareable link to collect payments",
    keywords: ["create", "new", "payment link", "share", "collect"],
    icon: "add-circle-outline", iconBg: "#EFF6FF", iconColor: "#2563EB",
    route: "/(screens)/create-payment-link",
  },
  {
    id: "received-links", category: "Payment Links",
    title: "Received Links", description: "Payment links others sent you, ready to pay from your wallet",
    keywords: ["received", "inbox", "payment link", "pay", "wallet"],
    icon: "arrow-down-circle-outline", iconBg: "#EFF6FF", iconColor: "#3B82F6",
    route: "/(screens)/received-links",
  },

  // ── Cards & Finance ────────────────────────────────────────
  {
    id: "wallet", category: "Cards & Finance",
    title: "My Cards", description: "View and manage your virtual payment cards",
    keywords: ["cards", "wallet", "virtual", "balance", "visa"],
    icon: "card-outline", iconBg: "#F5F3FF", iconColor: "#7C3AED",
    route: "/(tabs)/wallet",
  },
  {
    id: "transfer", category: "Cards & Finance",
    title: "Transfer", description: "Move funds between your cards or accounts",
    keywords: ["transfer", "move", "funds", "card", "account"],
    icon: "swap-horizontal-outline", iconBg: "#EFF6FF", iconColor: "#2563EB",
    route: "/(tabs)/transfer",
  },
  {
    id: "analytics", category: "Cards & Finance",
    title: "Spending Analytics", description: "Track spending trends, budgets and insights",
    keywords: ["analytics", "spending", "budget", "chart", "insights", "stats"],
    icon: "bar-chart-outline", iconBg: "#F0FDF4", iconColor: "#059669",
    route: "/(screens)/analytics",
  },
  {
    id: "purchases-hub", category: "Cards & Finance",
    title: "Transaction History", description: "Browse all your past transactions",
    keywords: ["history", "transactions", "purchases", "past", "records"],
    icon: "receipt-outline", iconBg: "#FFF7ED", iconColor: "#EA580C",
    route: "/(screens)/purchases-hub",
  },

  // ── Shopping & Services ────────────────────────────────────
  {
    id: "travel", category: "Shopping",
    title: "Travel Booking", description: "Book buses, flights and hotels",
    keywords: ["travel", "flight", "bus", "hotel", "booking", "trip"],
    icon: "airplane-outline", iconBg: "#EFF6FF", iconColor: "#3B82F6",
    route: "/(screens)/travel",
  },

  // ── Community ──────────────────────────────────────────────
  {
    id: "contributions", category: "Community",
    title: "My Contributions", description: "See all your stokvel and savings contributions",
    keywords: ["contributions", "stokvel", "savings", "history"],
    icon: "wallet-outline", iconBg: "#F0FDF4", iconColor: "#059669",
    route: "/(screens)/contributions",
  },
  {
    id: "bill-split", category: "Community",
    title: "Bill Splitting", description: "Split a bill with friends and settle up in the app",
    keywords: ["bill", "split", "group", "friends", "settle", "share"],
    icon: "people-outline", iconBg: "#FFF7ED", iconColor: "#EA580C",
    route: "/(screens)/bill-split",
  },
  {
    id: "loyalty", category: "Community",
    title: "Loyalty Rewards", description: "Earn and redeem loyalty points for exclusive perks",
    keywords: ["loyalty", "rewards", "points", "perks", "earn", "redeem"],
    icon: "star-outline", iconBg: "#FFF7ED", iconColor: "#F59E0B",
    route: "/(screens)/loyalty",
  },

  // ── Contacts ──────────────────────────────────────────────
  {
    id: "contacts", category: "Contacts",
    title: "Contacts", description: "View and manage your saved BukkaPay contacts",
    keywords: ["contacts", "people", "friends", "saved"],
    icon: "people-circle-outline", iconBg: "#FFF1F2", iconColor: "#EC4899",
    route: "/(screens)/contacts",
  },

  {
    id: "business", category: "Business",
    title: "BukkaPay Business", description: "Sell, rent out property and send bills — in the merchant app",
    keywords: ["business", "merchant", "landlord", "property", "billing", "invoice", "vendor", "shop", "sell"],
    icon: "storefront-outline", iconBg: "#FFF7ED", iconColor: "#EA580C",
    route: "/(screens)/business",
  },
  {
    id: "tenant-dashboard", category: "Business",
    title: "Tenant Dashboard", description: "View your lease, rent history and upcoming dues",
    keywords: ["tenant", "rent", "lease", "property", "payment"],
    icon: "key-outline", iconBg: "#FFFBEB", iconColor: "#D97706",
    route: "/(screens)/tenant-dashboard",
  },

  // ── Account & Settings ─────────────────────────────────────
  {
    id: "profile", category: "Account",
    title: "My Profile", description: "View and update your personal information",
    keywords: ["profile", "account", "personal", "name", "settings"],
    icon: "person-outline", iconBg: "#F5F3FF", iconColor: "#7C3AED",
    route: "/(tabs)/profile",
  },
  {
    id: "security-settings", category: "Account",
    title: "Security Settings", description: "Change PIN, password, biometrics and limits",
    keywords: ["security", "pin", "password", "biometrics", "lock", "settings"],
    icon: "shield-checkmark-outline", iconBg: "#F0FDF4", iconColor: "#059669",
    route: "/(screens)/security-settings",
  },
  {
    id: "my-id", category: "Account",
    title: "My BukkaPay ID", description: "Your personal ID and QR code for receiving payments",
    keywords: ["id", "bukkapay id", "qr", "receive", "code", "identity"],
    icon: "id-card-outline", iconBg: "#EFF6FF", iconColor: "#2563EB",
    route: "/(screens)/my-id",
  },
  {
    id: "notifications", category: "Account",
    title: "Notifications", description: "View all your alerts, updates and messages",
    keywords: ["notifications", "alerts", "messages", "updates"],
    icon: "notifications-outline", iconBg: "#FFFBEB", iconColor: "#F59E0B",
    route: "/(screens)/notifications",
  },
  {
    id: "support-chat", category: "Account",
    title: "Support Chat", description: "Chat with BukkaPay support for help",
    keywords: ["support", "help", "chat", "contact us", "customer service"],
    icon: "chatbubble-ellipses-outline", iconBg: "#F5F3FF", iconColor: "#8B5CF6",
    route: "/(screens)/support-chat",
  },
  {
    id: "my-claims", category: "Account",
    title: "My Claims", description: "Track disputes and refund claims",
    keywords: ["claims", "dispute", "refund", "issue"],
    icon: "document-text-outline", iconBg: "#FFF1F2", iconColor: "#E11D48",
    route: "/(screens)/my-claims",
  },
  {
    id: "about", category: "Account",
    title: "About BukkaPay", description: "App version, terms of service and privacy policy",
    keywords: ["about", "version", "terms", "privacy", "policy"],
    icon: "information-circle-outline", iconBg: "#F8F9FA", iconColor: "#6B7280",
    route: "/(screens)/about",
  },
  {
    id: "features-hub", category: "Account",
    title: "All Features", description: "Browse the complete list of BukkaPay features",
    keywords: ["features", "all", "hub", "explore", "discover"],
    icon: "grid-outline", iconBg: "#F5F3FF", iconColor: "#7C3AED",
    route: "/(screens)/features-hub",
  },
];

const QUICK_ACCESS: AppItem["id"][] = [
  "send-money", "topup", "qr-pay", "request",
  "wallet", "payment-links", "analytics", "contributions",
];

export default function Search() {
  const router = useRouter();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q))
    );
  }, [query]);

  const groupedResults = useMemo(() => {
    const map: Record<string, AppItem[]> = {};
    filteredResults.forEach((item) => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, [filteredResults]);

  const quickItems = QUICK_ACCESS.map((id) => ALL_ITEMS.find((i) => i.id === id)).filter((i): i is AppItem => !!i);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search features, payments, settings…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Empty state: quick access grid ── */}
        {query.trim() === "" && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>QUICK ACCESS</Text>
            <View style={styles.quickGrid}>
              {quickItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.quickIcon, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={22} color={item.iconColor} />
                  </View>
                  <Text style={[styles.quickLabel, { color: colors.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>ALL SECTIONS</Text>
            {["Payments", "Cards & Finance", "Shopping", "Community", "Account"].map((cat) => {
              const items = ALL_ITEMS.filter((i) => i.category === cat);
              return (
                <View key={cat} style={styles.categoryBlock}>
                  <Text style={[styles.categoryLabel, { color: colors.primary || "#7C3AED" }]}>{cat}</Text>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.row, { borderBottomColor: colors.border }]}
                      onPress={() => router.push(item.route as any)}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: item.iconBg }]}>
                        <Ionicons name={item.icon} size={18} color={item.iconColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
                        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Search results ── */}
        {query.trim() !== "" && filteredResults.length === 0 && (
          <View style={styles.noResults}>
            <View style={[styles.noResultsIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="search" size={32} color={colors.textMuted} />
            </View>
            <Text style={[styles.noResultsTitle, { color: colors.text }]}>Nothing found</Text>
            <Text style={[styles.noResultsDesc, { color: colors.textSecondary }]}>
              Try different keywords
            </Text>
          </View>
        )}

        {query.trim() !== "" && filteredResults.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {filteredResults.length} RESULT{filteredResults.length !== 1 ? "S" : ""}
            </Text>
            {Object.entries(groupedResults).map(([cat, items]) => (
              <View key={cat} style={styles.categoryBlock}>
                <Text style={[styles.categoryLabel, { color: colors.primary || "#7C3AED" }]}>{cat}</Text>
                {items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    onPress={() => router.push(item.route as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.resultIcon, { backgroundColor: item.iconBg }]}>
                      <Ionicons name={item.icon} size={20} color={item.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultTitle, { color: colors.text }]}>{item.title}</Text>
                      <Text style={[styles.resultDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={item.iconColor} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  quickCard: {
    width: "22.5%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 8,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  categoryBlock: {
    marginBottom: 20,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  resultIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  noResults: {
    paddingTop: 60,
    alignItems: "center",
    gap: 10,
  },
  noResultsIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  noResultsDesc: {
    fontSize: 14,
  },
});
