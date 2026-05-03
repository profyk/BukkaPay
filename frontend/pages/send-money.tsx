import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

export default function SendMoney() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBanner, { backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Money</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtitle}>Choose your transfer type</Text>
      </View>

      <ScrollView contentContainerStyle={styles.optionsContainer}>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/(screens)/scan-pay")}
          activeOpacity={0.85}
        >
          <View style={styles.optionHeader}>
            <View style={[styles.optionIconBox, { backgroundColor: "#2563EB" }]}>
              <Ionicons name="phone-portrait" size={30} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Local Transfer</Text>
              <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                Send to a BukkaPay wallet, mobile money or bank account
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </View>
          <View style={[styles.tagsRow, { borderTopColor: colors.border }]}>
            {[
              { icon: "people", label: "BukkaPay Wallet", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
              { icon: "phone-portrait-outline", label: "Mobile Money", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
              { icon: "business-outline", label: "Bank", color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
            ].map(t => (
              <View key={t.label} style={[styles.tag, { backgroundColor: t.bg }]}>
                <Ionicons name={t.icon as any} size={11} color={t.color} />
                <Text style={[styles.tagText, { color: t.color }]}>{t.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.card, borderColor: "#7C3AED", borderWidth: 2 }]}
          onPress={() => router.push("/(screens)/send-to-anyone")}
          activeOpacity={0.85}
        >
          <View style={[styles.badge, { backgroundColor: "#7C3AED" }]}>
            <Text style={styles.badgeText}>INTERNATIONAL / ABROAD</Text>
          </View>
          <View style={styles.optionHeader}>
            <View style={[styles.optionIconBox, { backgroundColor: "#7C3AED" }]}>
              <Ionicons name="earth" size={30} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Send to Anyone</Text>
              <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                No BukkaPay account needed — share a secure claim link via WhatsApp, SMS or Email
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </View>
          <View style={[styles.tagsRow, { borderTopColor: colors.border }]}>
            {[
              { icon: "logo-whatsapp", label: "WhatsApp", color: "#25D366", bg: "rgba(37,211,102,0.1)" },
              { icon: "mail-outline", label: "Email", color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
              { icon: "chatbubble-outline", label: "SMS", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
              { icon: "shield-checkmark-outline", label: "PIN Secured", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
            ].map(t => (
              <View key={t.label} style={[styles.tag, { backgroundColor: t.bg }]}>
                <Ionicons name={t.icon as any} size={11} color={t.color} />
                <Text style={[styles.tagText, { color: t.color }]}>{t.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        <View style={[styles.securityRow, { backgroundColor: darkMode ? "#1F2937" : "#F0FDF4" }]}>
          <Ionicons name="lock-closed" size={16} color="#10B981" />
          <Text style={[styles.securityText, { color: darkMode ? "#6EE7B7" : "#065F46" }]}>
            All transfers are encrypted and PIN-secured
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  optionsContainer: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 100, gap: 16 },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.5 },
  optionCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
  optionHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  optionIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  optionSubtitle: { fontSize: 13, lineHeight: 18 },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tagText: { fontSize: 11, fontWeight: "600" },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  securityText: { fontSize: 13, fontWeight: "500" },
});
