import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import WalletCard from "../components/WalletCard";
import TransactionList from "../components/TransactionList";
import ActionButtons from "../components/ActionButtons";
import AppBar from "../components/AppBar";
import { fetchCards, fetchTransactions } from "../lib/api";
import { mapCardFromAPI, mapTransactionFromAPI } from "../lib/mappers";
import { useToast } from "../hooks/use-toast";
import { getCurrentUser } from "../lib/auth";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { colors } = useTheme();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setUserName(user.name);
    })();
  }, []);

  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", 3],
    queryFn: () => fetchTransactions(3),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeader();
      const res = await fetch(API_BASE + "/api/seed", { method: "POST", headers });
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Success", description: "Sample data added!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add sample data", variant: "destructive" });
    },
  });

  const mainCard = cards && cards.length > 0 ? mapCardFromAPI(cards[0]) : null;
  const mappedTransactions = transactions?.map(mapTransactionFromAPI) || [];

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <AppBar />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
        {cardsLoading && <View style={[styles.skeleton, { backgroundColor: colors.surface }]} />}
        {mainCard && (
          <WalletCard
            {...mainCard}
            balance={mainCard.balance}
            currency="R"
          />
        )}
        {!cardsLoading && !mainCard && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No cards yet. Add sample data to get started!</Text>
            <TouchableOpacity
              style={[styles.seedButton, seedMutation.isPending && styles.disabledButton]}
              onPress={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Ionicons name="server-outline" size={18} color="#FFFFFF" />
              <Text style={styles.seedButtonText}>
                {seedMutation.isPending ? "Adding..." : "Add Sample Data"}
              </Text>
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
