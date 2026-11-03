import { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../lib/ThemeContext";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";

type Timeframe = "week" | "month" | "year";

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  food: "cart-outline",
  groceries: "storefront-outline",
  transport: "car-outline",
  entertainment: "film-outline",
  bills: "document-text-outline",
  utilities: "flash-outline",
  transfer: "swap-horizontal-outline",
  shopping: "bag-outline",
  other: "grid-outline",
};

function getProgressColor(ratio: number) {
  if (ratio > 90) return "#EF4444";
  if (ratio > 70) return "#F59E0B";
  return "#10B981";
}

function AlertIcon({ type }: { type: string }) {
  if (type === "warning") return <Ionicons name="warning-outline" size={18} color="#F59E0B" />;
  if (type === "success") return <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" />;
  return <Ionicons name="information-circle-outline" size={18} color="#3B82F6" />;
}

export default function Analytics() {
  const router = useRouter();
  const { colors } = useTheme();
  const [timeframe, setTimeframe] = useState<Timeframe>("month");

  const { data: rawTxData = [], isLoading } = useQuery<any[]>({
    queryKey: ["analytics-transactions"],
    queryFn: async () => {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/transactions?limit=200`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // The timeframe tabs used to be decorative — `days` was computed but
  // never actually applied to the fetch, so Week/Month/Year all showed the
  // same 200 most-recent transactions. The backend has no date-range filter
  // on this endpoint, so filter what we already fetched instead.
  const txData = useMemo(() => {
    const days = timeframe === "week" ? 7 : timeframe === "month" ? 30 : 365;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rawTxData.filter((t: any) => new Date(t.createdAt).getTime() >= cutoff);
  }, [rawTxData, timeframe]);

  // Derive analytics from real transactions
  const totalSpent = txData.reduce((sum: number, t: any) => {
    if (t.type === "debit" || t.type === "payment" || t.type === "send") {
      return sum + Math.abs(parseFloat(t.amount || "0"));
    }
    return sum;
  }, 0);

  const totalReceived = txData.reduce((sum: number, t: any) => {
    if (t.type === "credit" || t.type === "receive" || t.type === "topup") {
      return sum + Math.abs(parseFloat(t.amount || "0"));
    }
    return sum;
  }, 0);

  const byCategory: Record<string, number> = {};
  txData.forEach((t: any) => {
    const cat = (t.category || "other").toLowerCase();
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(parseFloat(t.amount || "0"));
  });

  const categoryEntries = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const alerts: Array<{ type: string; message: string }> = [];
  if (totalSpent > totalReceived * 0.8) {
    alerts.push({ type: "warning", message: "You've spent more than 80% of what you received this period." });
  }
  if (categoryEntries[0]?.[1] > totalSpent * 0.4) {
    alerts.push({ type: "warning", message: `${categoryEntries[0][0]} is your biggest spend category at ${((categoryEntries[0][1] / totalSpent) * 100).toFixed(0)}%.` });
  }
  if (totalReceived > 0) {
    alerts.push({ type: "success", message: `You received R${totalReceived.toFixed(2)} this period.` });
  }
  if (alerts.length === 0) {
    alerts.push({ type: "info", message: "Make a few transactions to see spending insights here." });
  }

  const fmt = (amount: number) =>
    `R${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Timeframe selector */}
      <View style={[styles.timeframeRow, { backgroundColor: colors.surface }]}>
        {(["week", "month", "year"] as Timeframe[]).map((tf) => (
          <TouchableOpacity
            key={tf}
            onPress={() => setTimeframe(tf)}
            style={[styles.timeframeBtn, timeframe === tf && { backgroundColor: colors.primary }]}
          >
            <Text style={[
              styles.timeframeTxt,
              { color: timeframe === tf ? "#FFFFFF" : colors.textSecondary },
            ]}>
              {tf.charAt(0).toUpperCase() + tf.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#EF4444" }]}>
          <Ionicons name="trending-down-outline" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={styles.summaryLabel}>Spent</Text>
          <Text style={styles.summaryAmount}>{fmt(totalSpent)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#10B981" }]}>
          <Ionicons name="trending-up-outline" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={styles.summaryLabel}>Received</Text>
          <Text style={styles.summaryAmount}>{fmt(totalReceived)}</Text>
        </View>
      </View>

      {/* Net balance card */}
      <View style={[styles.netCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.netRow}>
          <View>
            <Text style={[styles.netLabel, { color: colors.textSecondary }]}>Net Flow</Text>
            <Text style={[
              styles.netAmount,
              { color: totalReceived - totalSpent >= 0 ? "#10B981" : "#EF4444" },
            ]}>
              {totalReceived - totalSpent >= 0 ? "+" : ""}{fmt(totalReceived - totalSpent)}
            </Text>
          </View>
          <View style={[styles.txCountBadge, { backgroundColor: colors.surface }]}>
            <Text style={[styles.txCountText, { color: colors.text }]}>{txData.length}</Text>
            <Text style={[styles.txCountLabel, { color: colors.textSecondary }]}>transactions</Text>
          </View>
        </View>
        {totalSpent > 0 && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Spent vs Received</Text>
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                {totalReceived > 0 ? ((totalSpent / totalReceived) * 100).toFixed(0) : 100}%
              </Text>
            </View>
            <View style={[styles.progressBg, { backgroundColor: colors.surface }]}>
              <View style={[
                styles.progressFill,
                {
                  width: `${Math.min((totalSpent / (totalReceived || totalSpent || 1)) * 100, 100)}%`,
                  backgroundColor: getProgressColor((totalSpent / (totalReceived || totalSpent || 1)) * 100),
                },
              ]} />
            </View>
          </View>
        )}
      </View>

      {/* Spending by category */}
      {categoryEntries.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Spending by Category</Text>
          {categoryEntries.map(([cat, amount]) => {
            const pct = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
            const iconName = CATEGORY_ICONS[cat] || CATEGORY_ICONS.other;
            return (
              <View key={cat} style={[styles.catCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.catHeader}>
                  <View style={[styles.catIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={iconName} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.catName, { color: colors.text }]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                    <Text style={[styles.catPct, { color: colors.textSecondary }]}>{pct.toFixed(1)}% of total</Text>
                  </View>
                  <Text style={[styles.catAmount, { color: colors.text }]}>{fmt(amount)}</Text>
                </View>
                <View style={[styles.catProgressBg, { backgroundColor: colors.surface }]}>
                  <View style={[
                    styles.catProgressFill,
                    { width: `${Math.min(pct, 100)}%`, backgroundColor: getProgressColor(pct) },
                  ]} />
                </View>
              </View>
            );
          })}
        </>
      )}

      {isLoading && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading your data...</Text>
        </View>
      )}

      {!isLoading && txData.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <Ionicons name="bar-chart-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
          <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
            Your spending analytics will appear here once you start transacting.
          </Text>
        </View>
      )}

      {/* Insights */}
      {alerts.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Insights</Text>
          {alerts.map((alert, idx) => (
            <View key={idx} style={[
              styles.alertCard,
              {
                backgroundColor: alert.type === "warning" ? "rgba(245,158,11,0.08)"
                  : alert.type === "success" ? "rgba(16,185,129,0.08)"
                  : "rgba(59,130,246,0.08)",
                borderColor: alert.type === "warning" ? "rgba(245,158,11,0.2)"
                  : alert.type === "success" ? "rgba(16,185,129,0.2)"
                  : "rgba(59,130,246,0.2)",
              },
            ]}>
              <AlertIcon type={alert.type} />
              <Text style={[styles.alertText, { color: colors.text }]}>{alert.message}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 100 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  timeframeRow: {
    flexDirection: "row",
    margin: 24,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  timeframeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  timeframeTxt: { fontSize: 13, fontWeight: "600" },
  summaryRow: { flexDirection: "row", gap: 12, paddingHorizontal: 24, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  summaryAmount: { fontSize: 18, fontWeight: "700", color: "#fff" },
  netCard: {
    marginHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
  },
  netRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  netLabel: { fontSize: 13, marginBottom: 4 },
  netAmount: { fontSize: 26, fontWeight: "800" },
  txCountBadge: { alignItems: "center", borderRadius: 12, padding: 12 },
  txCountText: { fontSize: 22, fontWeight: "700" },
  txCountLabel: { fontSize: 11 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { fontSize: 12 },
  progressBg: { height: 10, borderRadius: 5 },
  progressFill: { height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginHorizontal: 24, marginBottom: 12 },
  catCard: {
    marginHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  catHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  catIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catName: { fontSize: 14, fontWeight: "600" },
  catPct: { fontSize: 12, marginTop: 2 },
  catAmount: { fontSize: 15, fontWeight: "700" },
  catProgressBg: { height: 8, borderRadius: 4 },
  catProgressFill: { height: 8, borderRadius: 4 },
  emptyState: {
    alignItems: "center",
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 40,
    gap: 8,
    marginBottom: 24,
  },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptySubText: { fontSize: 13, textAlign: "center" },
  alertCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 24,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  alertText: { fontSize: 13, flex: 1, lineHeight: 19 },
});
