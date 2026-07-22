import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Platform, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTheme } from "../lib/ThemeContext";

// Only categories with an active purchase flow in the app today. Bus vs.
// flight travel bookings both use category "travel" (metadata.ticketType
// distinguishes them, see iconName below) — airtime/electricity/tickets/
// hotels/rentals/contributions/transfers/payments were removed from the
// app but may still exist as historical rows, so they fall back to a
// generic receipt icon/color below rather than disappearing from "All".
const categories = [
  { id: "all",    label: "All",    icon: "filter-outline"   as keyof typeof Ionicons.glyphMap },
  { id: "travel", label: "Travel", icon: "airplane-outline" as keyof typeof Ionicons.glyphMap },
];

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  travel: "airplane-outline",
};

const categoryColors: Record<string, string> = {
  travel: "#7C3AED",
};

function getStatusColors(status: string, darkMode: boolean) {
  const map: Record<string, { bg: string; text: string }> = {
    success:  { bg: darkMode ? "rgba(16,185,129,0.15)" : "#D1FAE5", text: "#047857" },
    completed:{ bg: darkMode ? "rgba(16,185,129,0.15)" : "#D1FAE5", text: "#047857" },
    pending:  { bg: darkMode ? "rgba(245,158,11,0.15)" : "#FEF3C7", text: "#B45309" },
    failed:   { bg: darkMode ? "rgba(239,68,68,0.15)"  : "#FEE2E2", text: "#B91C1C" },
    refunded: { bg: darkMode ? "rgba(107,114,128,0.15)": "#F3F4F6", text: "#374151" },
  };
  return map[status] || map.success;
}

export default function PurchasesHub() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const queryUrl = activeCategory !== "all"
    ? `/api/purchase-transactions?category=${activeCategory}`
    : "/api/purchase-transactions";

  const { data: transactions = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: [queryUrl],
  });

  const filteredTransactions = transactions.filter((t: any) => {
    const name = (t.merchantName || t.title || "").toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Purchases</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={styles.refreshButton}
          disabled={isRefetching}
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={isRefetching ? colors.textMuted : colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchInputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            placeholder="Search purchases..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setActiveCategory(cat.id)}
                style={[
                  styles.filterChip,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Ionicons name={cat.icon} size={14} color={isActive ? "#fff" : colors.textSecondary} />
                <Text style={[styles.filterChipText, { color: isActive ? "#fff" : colors.textSecondary }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Transaction list */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: 60, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {searchQuery ? "No results found" : activeCategory !== "all" ? `No ${activeCategory} purchases yet` : "No purchases yet"}
            </Text>
            <Text style={[styles.emptyStateSubText, { color: colors.textMuted }]}>
              Your purchases will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.transactionList}>
            {filteredTransactions.map((transaction: any) => {
              const meta = transaction.metadata || {};
              const isTravel = transaction.category === "travel";
              const iconName = isTravel && meta.ticketType === "bus"
                ? "bus-outline"
                : (categoryIcons[transaction.category] || "receipt-outline");
              const iconBg = categoryColors[transaction.category] || colors.textMuted;
              const sColors = getStatusColors(transaction.status, darkMode);
              const displayName = transaction.merchantName || transaction.title || "Purchase";
              const routeLine = isTravel && meta.from && meta.to ? `${meta.from} → ${meta.to}` : null;

              return (
                <TouchableOpacity
                  key={transaction.id}
                  onPress={() => router.push(`/(screens)/purchase-detail?id=${transaction.id}` as any)}
                  style={[styles.transactionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  activeOpacity={0.75}
                >
                  <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={iconName} size={20} color="#fff" />
                  </View>

                  <View style={styles.txInfo}>
                    <View style={styles.txTopRow}>
                      <Text style={[styles.txName, { color: colors.text }]} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={[styles.txAmount, { color: colors.text }]}>
                        R{Math.abs(Number(transaction.amount)).toFixed(2)}
                      </Text>
                    </View>

                    {routeLine && (
                      <Text style={[styles.routeLine, { color: colors.primary }]} numberOfLines={1}>
                        {routeLine}
                      </Text>
                    )}

                    <View style={styles.txBottomRow}>
                      <View style={[styles.statusBadge, { backgroundColor: sColors.bg }]}>
                        <Text style={[styles.statusText, { color: sColors.text }]}>
                          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                        </Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textMuted }]}>
                        {format(new Date(transaction.createdAt), "MMM d, yyyy")}
                      </Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  refreshButton: { padding: 8, borderRadius: 20 },
  searchContainer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  filterContainer: { paddingBottom: 10, height: 52 },
  filterScroll: { paddingHorizontal: 24, gap: 8 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    height: 34,
  },
  filterChipText: { fontSize: 12, fontWeight: "600" },
  listContainer: { flex: 1, paddingHorizontal: 24 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyStateText: { fontWeight: "600", fontSize: 15, marginTop: 8 },
  emptyStateSubText: { fontSize: 13 },
  transactionList: { gap: 10 },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  txIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txInfo: { flex: 1, minWidth: 0 },
  txTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  txName: { fontWeight: "600", fontSize: 14, flex: 1 },
  txAmount: { fontWeight: "700", fontSize: 15 },
  routeLine: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  txBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "600" },
  dateText: { fontSize: 11 },
});
