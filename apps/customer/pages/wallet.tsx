import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import PremiumCard from "../components/PremiumCard";
import AddCardDialog from "../components/AddCardDialog";
import { fetchCards, setDefaultCard } from "../lib/api";
import { mapCardFromAPI } from "../lib/mappers";
import { getCurrentUser } from "../lib/auth";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import { queryClient } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";

const cardColors: Array<"blue" | "gold" | "black" | "purple"> = ["blue", "gold", "black", "purple"];

export default function Wallet() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();
  const { toast } = useToast();
  const [userName, setUserName] = useState("Card Holder");

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setUserName(user.name);
    })();
  }, []);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      toast({ title: "Default card updated", description: "This card will be used for Tap to Pay." });
    },
    onError: () => toast({ title: "Error", description: "Could not set default card.", variant: "destructive" }),
  });

  const mappedCards = cards?.map(mapCardFromAPI) || [];
  // Balances in different currencies can't be added together.
  const totals = Object.entries(
    mappedCards.reduce((acc: Record<string, number>, card: any) => {
      acc[card.currency] = (acc[card.currency] || 0) + Number(card.balance);
      return acc;
    }, {}),
  ) as [string, number][];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Wallet</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage your cards & funds</Text>
        </View>
      </View>

      <View style={[styles.balanceBanner, { backgroundColor: colors.primary }]}>
        <Text style={styles.balanceLabel}>Your Balance</Text>
        {(totals.length ? totals : [["ZAR", 0] as [string, number]]).map(([ccy, amount]) => (
          <Text key={ccy} style={totals.length > 1 ? styles.subBalanceAmount : styles.totalBalanceAmount}>
            {getCurrency(ccy).symbol}{amount.toFixed(2)} {totals.length > 1 ? ccy : ""}
          </Text>
        ))}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/(screens)/topup" as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="add" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.actionLabel}>Top Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/(screens)/send-money" as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="send" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/(screens)/request" as any)}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="download" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.actionLabel}>Request</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Cards</Text>

      {isLoading && [1, 2].map(i => (
        <View key={i} style={[styles.skeleton, { backgroundColor: colors.surface }]} />
      ))}

      {mappedCards.map((card: any, index: number) => (
        <View key={card.id} style={[styles.cardContainer, { backgroundColor: colors.card, borderColor: card.isDefault ? colors.primary : colors.cardBorder, borderWidth: card.isDefault ? 2 : 1 }]}>
          <PremiumCard
            cardNumber={card.issuedCard?.last4 ? card.cardNumber : ""}
            cardStatus={card.issuedCard?.status ?? null}
            expiryDate={card.issuedCard?.last4 ? (card.expiryDate || "—") : "—"}
            holderName={userName}
            balance={Number(card.balance)}
            currency={getCurrency(card.currency).symbol}
            color={cardColors[index % cardColors.length]}
          />
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              {card.isDefault ? (
                <View style={styles.defaultBadge}>
                  <Ionicons name="star" size={10} color="#FFFFFF" />
                  <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                </View>
              ) : (
                <View style={[styles.virtualBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.virtualBadgeText, { color: colors.primary }]}>VIRTUAL</Text>
                </View>
              )}
              <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
              <View style={[styles.currencyBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.currencyBadgeText, { color: colors.primary }]}>{card.currency}</Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              <Text style={[styles.cardBalance, { color: colors.text }]}>
                {getCurrency(card.currency).symbol}{Number(card.balance).toFixed(2)}
              </Text>
              {card.frozen && (
                <View style={[styles.frozenBadge, { backgroundColor: darkMode ? "rgba(59,130,246,0.2)" : "#EFF6FF" }]}>
                  <Ionicons name="snow-outline" size={11} color="#3B82F6" />
                  <Text style={styles.frozenText}>Frozen</Text>
                </View>
              )}
            </View>
          </View>
          {!card.isDefault && (
            <TouchableOpacity
              style={styles.setDefaultBtn}
              onPress={() => setDefaultMutation.mutate(card.id)}
              disabled={setDefaultMutation.isPending}
            >
              <Ionicons name="star-outline" size={14} color={colors.primary} />
              <Text style={[styles.setDefaultText, { color: colors.primary }]}>Set as Default</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.setDefaultBtn}
            onPress={() => router.push({ pathname: "/(screens)/card", params: { walletId: card.id } } as any)}
          >
            <Ionicons name="card-outline" size={14} color={colors.primary} />
            <Text style={[styles.setDefaultText, { color: colors.primary }]}>
              {card.issuedCard?.status === "active" ? "Card details, controls & tap to pay"
                : card.issuedCard?.status === "frozen" ? "Card frozen · manage"
                : card.issuedCard?.status === "pending_kyc" ? "Verify your ID to activate your card"
                : "Get your Visa card"}
            </Text>
          </TouchableOpacity>
          <View style={styles.stitchRow}>
            <Ionicons name="shield-checkmark" size={11} color={colors.textMuted} />
            <Text style={[styles.stitchText, { color: colors.textMuted }]}>Visa virtual card · online & tap to pay worldwide</Text>
          </View>
        </View>
      ))}

      {!isLoading && mappedCards.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="wallet-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No cards yet</Text>
          <Text style={[styles.emptySubText, { color: colors.textMuted }]}>Add your first virtual card below</Text>
        </View>
      )}

      <AddCardDialog />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingHorizontal: 24, paddingBottom: 120 },
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  balanceBanner: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  balanceLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 10 },
  totalBalanceAmount: { fontSize: 32, fontWeight: "800", color: "#FFFFFF", marginBottom: 24 },
  subBalanceAmount: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginBottom: 6 },
  quickActions: { flexDirection: "row", justifyContent: "space-between" },
  actionBtn: { alignItems: "center", gap: 6 },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  skeleton: { height: 240, borderRadius: 16, marginBottom: 20 },
  cardContainer: {
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 4,
  },
  cardInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  currencyBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  currencyBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  virtualBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  virtualBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  cardBalance: { fontSize: 15, fontWeight: "700" },
  frozenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  frozenText: { fontSize: 10, fontWeight: "600", color: "#3B82F6" },
  defaultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#7C3AED",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.5 },
  setDefaultBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  setDefaultText: { fontSize: 13, fontWeight: "600" },
  stitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  stitchText: { fontSize: 11 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptySubText: { fontSize: 13 },
});
