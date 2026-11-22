import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";

export default function ActionButtons() {
  const router = useRouter();
  const { colors } = useTheme();

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string; color: string }[] = [
    { icon: "send",              label: "Send",    href: "/(screens)/send-money",         color: "#3B82F6" },
    { icon: "add-circle",        label: "Top Up",  href: "/(screens)/topup",              color: "#10B981" },
    { icon: "link",              label: "Request", href: "/(screens)/create-payment-link", color: "#8B5CF6" },
    { icon: "arrow-down-circle", label: "Receive", href: "/(screens)/my-id",              color: "#F59E0B" },
    { icon: "swap-horizontal",   label: "Swap",    href: "/(screens)/swap",               color: "#0EA5E9" },
    { icon: "briefcase",         label: "Supplier", href: "/(screens)/pay-supplier",      color: "#059669" },
    { icon: "grid",              label: "More",    href: "/(screens)/features-hub",       color: "#6366F1" },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={styles.actionItem}
          onPress={() => router.push(action.href as any)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: action.color }]}>
            <Ionicons name={action.icon} size={24} color="#FFFFFF" />
          </View>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  actionItem: {
    alignItems: "center",
    width: 64,
    gap: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
});
