import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

const MERCHANT_URL = (process.env.EXPO_PUBLIC_MERCHANT_URL || "https://merchant.bukkapay.com").replace(/\/$/, "");

const FEATURES: [any, string, string][] = [
  ["storefront-outline", "Accept payments", "QR codes, checkout links and tap-to-pay customers"],
  ["home-outline", "Properties & rent", "Units, tenants, rent links and rent received"],
  ["receipt-outline", "Bills", "School fees, levies, utilities and subscriptions"],
  ["people-outline", "Staff & payouts", "Cashier logins, settlements to your bank"],
];

/** Selling, renting out property and billing now live in BukkaPay Business
 *  (the merchant app). This screen keeps old links in the customer app working. */
export default function Business() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>BukkaPay Business</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.lead, { color: colors.text }]}>Run your business, stall or rental from BukkaPay Business.</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Sign in with this same BukkaPay account. Street vendors and individual landlords can start straight away with the ID they verified here.
        </Text>
        {FEATURES.map(([icon, title, sub]) => (
          <View key={title} style={[styles.row, { borderColor: colors.border }]}>
            <Ionicons name={icon} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>{sub}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => Linking.openURL(MERCHANT_URL)}>
          <Text style={styles.primaryBtnText}>Open BukkaPay Business</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(screens)/tenant-dashboard" as any)}>
          <Text style={{ color: colors.primary, fontWeight: "600", textAlign: "center", marginTop: 8 }}>Paying rent? Go to your tenant dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingHorizontal: 20, paddingBottom: 8 },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  body: { padding: 20, gap: 12 },
  lead: { fontSize: 20, fontWeight: "800" },
  muted: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 15, fontWeight: "600" },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
