import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

export default function Travel() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Travel Booking</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="airplane" size={64} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Coming Soon</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Book flights, buses, and accommodation directly from BukkaPay. We're putting the finishing touches on this feature.
        </Text>

        <View style={[styles.featuresCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { icon: "airplane-outline", label: "Flight Booking", desc: "Search & book flights across SA and internationally" },
            { icon: "bus-outline", label: "Bus Tickets", desc: "Intercape, FlixBus and major bus operators" },
            { icon: "bed-outline", label: "Hotel Stays", desc: "Compare and book hotels at the best prices" },
          ].map((item) => (
            <View key={item.label} style={[styles.featureRow, { borderBottomColor: colors.divider }]}>
              <View style={[styles.featureIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={item.icon as any} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLabel, { color: colors.text }]}>{item.label}</Text>
                <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
              </View>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
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
  featuresCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: { fontSize: 14, fontWeight: "600" },
  featureDesc: { fontSize: 12, marginTop: 2 },
  comingSoonBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: { fontSize: 10, fontWeight: "700", color: "#92400E" },
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
