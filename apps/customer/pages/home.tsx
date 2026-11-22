import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import WalletCard from "../components/WalletCard";
import TransactionList from "../components/TransactionList";
import ActionButtons from "../components/ActionButtons";
import AppBar from "../components/AppBar";
import { fetchCards, fetchTransactions } from "../lib/api";
import { mapCardFromAPI, mapTransactionFromAPI } from "../lib/mappers";
import { getCurrentUser } from "../lib/auth";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";

export default function Home() {
  const { colors } = useTheme();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setUserName(user.name);
    })();
  }, []);

  const { data: cards, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", 3],
    queryFn: () => fetchTransactions(3),
  });

  // Wallet switcher: one chip per currency (ZAR, BWP, USD…); balances are never mixed.
  const [currency, setCurrency] = useState<string | null>(null);
  const currencies: string[] = Array.from(new Set<string>((cards || []).map((c: any) => String(c.currency))));
  const defaultWallet = (cards || []).find((c: any) => c.isDefault) || (cards || [])[0];
  const shown = (currency && (cards || []).find((c: any) => c.currency === currency)) || defaultWallet;
  const mainCard = shown ? mapCardFromAPI(shown) : null;
  const mappedTransactions = transactions?.map(mapTransactionFromAPI) || [];

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <AppBar />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
        {cardsLoading && <View style={[styles.skeleton, { backgroundColor: colors.surface }]} />}
        {currencies.length > 1 && (
          <View style={[styles.switcher, { backgroundColor: colors.surface }]} accessibilityRole="tablist">
            {currencies.map((c) => {
              const on = (mainCard?.currency ?? "") === c;
              return (
                <TouchableOpacity key={c} onPress={() => setCurrency(c)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={[styles.switchChip, on && { backgroundColor: "#1A1A2E" }]}>
                  <Text style={{ color: on ? "#FFFFFF" : colors.textSecondary, fontWeight: "700" }}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {mainCard && (
          <WalletCard
            {...mainCard}
            balance={mainCard.balance}
            currency={getCurrency(mainCard.currency).symbol}
          />
        )}
        {!cardsLoading && !mainCard && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>We couldn't load your wallet.</Text>
            <TouchableOpacity style={styles.seedButton} onPress={() => refetchCards()}>
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.seedButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <ActionButtons />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
          <TouchableOpacity>
            <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>
        {txLoading && (
          <View>
            {[1, 2, 3].map(i => <View key={i} style={[styles.txSkeleton, { backgroundColor: colors.surface }]} />)}
          </View>
        )}
        {!txLoading && mappedTransactions.length > 0 && <TransactionList transactions={mappedTransactions} />}
        {!txLoading && mappedTransactions.length === 0 && (
          <Text style={[styles.noTransactions, { color: colors.textSecondary }]}>No transactions yet</Text>
        )}
      </View>

    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: "row", borderRadius: 999, padding: 4, marginBottom: 12, gap: 4 },
  switchChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  outerContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  skeleton: {
    height: 192,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    color: "#6B7280",
    marginBottom: 16,
  },
  seedButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7C3AED",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  seedButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    color: "#7C3AED",
    fontWeight: "500",
  },
  txSkeleton: {
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    marginBottom: 8,
  },
  noTransactions: {
    textAlign: "center",
    paddingVertical: 32,
    color: "#6B7280",
    fontSize: 14,
  },
});
