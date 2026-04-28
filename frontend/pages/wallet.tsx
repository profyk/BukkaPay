import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import PremiumCard from "../components/PremiumCard";
import AddCardDialog from "../components/AddCardDialog";
import { fetchCards } from "../lib/api";
import { mapCardFromAPI } from "../lib/mappers";
import { getCurrentUser } from "../lib/auth";

const cardColors: Array<"blue" | "gold" | "black" | "purple"> = ["blue", "gold", "black", "purple"];

export default function Wallet() {
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

  const mappedCards = cards?.map(mapCardFromAPI) || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cards</Text>
        <Text style={styles.headerSubtitle}>Manage your budgeting cards</Text>
      </View>

      {isLoading && [1, 2, 3].map(i => (
        <View key={i} style={styles.skeleton} />
      ))}

      {mappedCards.map((card: any, index: number) => (
        <View key={card.id} style={styles.cardContainer}>
          <PremiumCard
            cardNumber={card.cardNumber}
            holderName={userName}
            balance={card.balance}
            currency={card.currency}
            color={cardColors[index % cardColors.length]}
          />
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <View style={styles.virtualBadge}>
                <Text style={styles.virtualBadgeText}>VIRTUAL</Text>
              </View>
              <Text style={styles.cardTitle}>{card.title}</Text>
            </View>
            <Text style={styles.cardBalance}>
              {card.currency}{Number(card.balance).toFixed(2)}
            </Text>
          </View>
        </View>
      ))}

      {!isLoading && mappedCards.length === 0 && (
        <Text style={styles.emptyText}>No cards yet. Add your first card!</Text>
      )}

      <AddCardDialog />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  skeleton: {
    height: 192,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    marginBottom: 24,
  },
  cardContainer: {
    marginBottom: 24,
  },
  cardInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginTop: 10,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  virtualBadge: {
    backgroundColor: "#EDE9FE",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  virtualBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#7C3AED",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  cardBalance: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 48,
    color: "#6B7280",
    fontSize: 14,
  },
});
