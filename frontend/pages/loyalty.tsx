import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

export default function Loyalty() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Loyalty Rewards</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="gift" size={64} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Coming Soon</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Earn points on every transaction and unlock exclusive rewards, cashback, and tier benefits.
        </Text>

        <View style={[styles.tiersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.tiersHeading, { color: colors.textSecondary }]}>UPCOMING TIERS</Text>
          {[
            { tier: "Bronze", pts: "0+", color: "#CD7F32", icon: "medal-outline" },
            { tier: "Silver", pts: "1,000+", color: "#9CA3AF", icon: "medal-outline" },
            { tier: "Gold",   pts: "5,000+", color: "#F59E0B", icon: "medal-outline" },
            { tier: "Platinum", pts: "10,000+", color: "#7C3AED", icon: "diamond-outline" },
          ].map((t) => (
            <View key={t.tier} style={[styles.tierRow, { borderBottomColor: colors.divider }]}>
              <View style={[styles.tierDot, { backgroundColor: t.color + "22" }]}>
                <Ionicons name={t.icon as any} size={18} color={t.color} />
              </View>
              <Text style={[styles.tierName, { color: colors.text }]}>{t.tier}</Text>
              <Text style={[styles.tierPts, { color: colors.textSecondary }]}>{t.pts} pts</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>Soon</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.perksRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { icon: "cash-outline", label: "Cashback" },
            { icon: "ribbon-outline", label: "Discounts" },
            { icon: "star-outline", label: "VIP Perks" },
          ].map((p) => (
            <View key={p.label} style={styles.perkItem}>
              <Ionicons name={p.icon as any} size={24} color={colors.primary} />
              <Text style={[styles.perkLabel, { color: colors.text }]}>{p.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.notifyBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.back()}
        >
          <Ionicons name="notifications-outline" size={18} color="#fff" />
          <Text style={styles.notifyBtnText}>Notify Me When Ready</Text>
        </TouchableOpacity>
      </View>
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
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: { fontSize: 32, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  tiersCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  tiersHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tierDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tierName: { flex: 1, fontSize: 14, fontWeight: "600" },
  tierPts: { fontSize: 12 },
  soonBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  soonText: { fontSize: 10, fontWeight: "700", color: "#92400E" },
  perksRow: {
    width: "100%",
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    justifyContent: "space-around",
    marginBottom: 28,
  },
  perkItem: { alignItems: "center", gap: 6 },
  perkLabel: { fontSize: 12, fontWeight: "600" },
  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  notifyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
