import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

interface Feature {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
  comingSoon?: boolean;
}

const features: Feature[] = [
  { iconName: "swap-horizontal",  label: "Send Money",      route: "/(screens)/send-money",      color: "#2563EB" },
  { iconName: "cash",             label: "Cash Agents",     route: "/(screens)/cash-agents",     color: "#059669" },
  { iconName: "link",             label: "Payment Links",   route: "/(screens)/payment-links",   color: "#7C3AED" },
  { iconName: "bag-handle",       label: "Purchases Hub",   route: "/(screens)/purchases-hub",   color: "#0891B2" },
  { iconName: "heart",            label: "Contributions",   route: "/(screens)/contributions",   color: "#10B981" },
  { iconName: "briefcase",        label: "Pay Supplier",    route: "/(screens)/pay-supplier",    color: "#059669" },
  { iconName: "repeat",           label: "Swap Currency",   route: "/(screens)/swap",            color: "#0EA5E9" },
  { iconName: "bar-chart",        label: "Analytics",       route: "/(screens)/analytics",       color: "#2563EB" },
  { iconName: "chatbubble",       label: "Support Chat",    route: "/(screens)/support-chat",    color: "#EC4899" },
  { iconName: "airplane",         label: "Travel Booking",  route: "/(screens)/travel",          color: "#0EA5E9" },
  { iconName: "gift",             label: "Loyalty Rewards", route: "/(screens)/loyalty",         color: "#6D28D9", comingSoon: true },
];

export default function FeaturesHub() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Explore Features</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Discover all premium features in BukkaPay
        </Text>

        <View style={styles.grid}>
          {features.map((feature, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => {
                if (!feature.comingSoon) router.push(feature.route as any);
              }}
              style={[
                styles.featureCard,
                { backgroundColor: feature.color },
                feature.comingSoon && { opacity: 0.65 },
              ]}
              disabled={feature.comingSoon}
              activeOpacity={0.8}
            >
              {feature.comingSoon && (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Soon</Text>
                </View>
              )}
              <Ionicons name={feature.iconName} size={30} color="#FFFFFF" />
              <Text style={styles.featureLabel}>{feature.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { paddingHorizontal: 24, paddingBottom: 100, paddingTop: 16 },
  subtitle: { textAlign: "center", fontSize: 14, marginBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  featureCard: {
    width: "47%",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  comingSoonBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  comingSoonText: { fontSize: 10, fontWeight: "700", color: "#374151" },
  featureLabel: { fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginTop: 10, textAlign: "center" },
});
