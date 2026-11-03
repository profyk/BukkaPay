import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  "arrow-up-right": "arrow-up-outline",
  "arrow-down-left": "arrow-down-outline",
  "shopping-cart": "cart-outline",
  "credit-card": "card-outline",
  phone: "call-outline",
  wifi: "wifi-outline",
  zap: "flash-outline",
  coffee: "cafe-outline",
  home: "home-outline",
  car: "car-outline",
  gift: "gift-outline",
  send: "send-outline",
  download: "download-outline",
};

const getIconName = (tx: any): keyof typeof Ionicons.glyphMap => {
  if (typeof tx.iconName === "string" && iconMap[tx.iconName]) {
    return iconMap[tx.iconName];
  }
  if (tx.type === "income") return "arrow-down-outline";
  return "arrow-up-outline";
};

export default function TransactionList({ transactions }: { transactions: any[] }) {
  const { colors, darkMode } = useTheme();
  return (
    <View style={styles.container}>
      {transactions.map((tx) => (
        <View key={tx.id} style={styles.transactionRow}>
          <View style={styles.leftSection}>
            <View style={[
              styles.iconCircle,
              { backgroundColor: tx.type === "income" ? (darkMode ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)") : colors.surface },
            ]}>
              <Ionicons
                name={getIconName(tx)}
                size={20}
                color={tx.type === "income" ? colors.success : colors.textSecondary}
              />
            </View>
            <View>
              <Text style={[styles.txTitle, { color: colors.text }]}>{tx.title}</Text>
              <Text style={[styles.txMeta, { color: colors.textMuted }]}>
                {tx.date} {tx.category ? `• ${tx.category}` : ""}
              </Text>
            </View>
          </View>
          <Text style={[
            styles.txAmount,
            { color: tx.type === "income" ? colors.success : colors.text },
          ]}>
            {tx.type === "income" ? "+" : ""}{tx.amount.toFixed(2)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: {
    fontWeight: "600",
    fontSize: 14,
  },
  txMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    fontWeight: "600",
    fontSize: 14,
  },
});
