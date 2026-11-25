/** The customer's BukkaPay plan: the monthly account fee, free months and
 *  this month's status. The fee never puts an account into debt. */
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchMyPlan, WAIVER_REASONS } from "../lib/agents";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";

export default function MyPlan() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: plan, isLoading, error } = useQuery({ queryKey: ["my-plan"], queryFn: fetchMyPlan });
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const status = plan?.thisMonth;

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>My plan</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body}>
        {isLoading && <ActivityIndicator color={PRIMARY} />}
        {error && <Text style={{ color: "#DC2626" }}>{(error as Error).message}</Text>}
        {plan && (
          <>
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
              <Text style={[st.label, { color: colors.textMuted }]}>Monthly account fee</Text>
              <Text style={[st.big, { color: colors.text }]}>
                {plan.enabled ? `${plan.currency} ${plan.monthlyFee}` : "Free"}
              </Text>
              {plan.enabled && <Text style={{ color: colors.textMuted }}>Next charge on {date(plan.nextChargeDate)}</Text>}
              {plan.freeUntil && (
                <Text style={{ color: "#059669", fontWeight: "700", marginTop: 6 }}>Free until {date(plan.freeUntil)}</Text>
              )}
            </View>

            {status && (
              <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[st.label, { color: colors.textMuted }]}>This month</Text>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 4 }}>
                  {status.status === "charged" ? "Paid" : status.status === "due" ? "Waiting for funds" : "No charge"}
                </Text>
                {status.reason && <Text style={{ color: colors.textMuted, marginTop: 2 }}>{WAIVER_REASONS[status.reason] ?? status.reason}</Text>}
                {status.status === "due" && (
                  <Text style={{ color: colors.textMuted, marginTop: 6 }}>We'll try again daily. If your balance stays too low, this month is waived. You never go into debt.</Text>
                )}
              </View>
            )}

            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
              <Text style={[st.label, { color: colors.textMuted }]}>What's included</Text>
              {[
                ["wallet-outline", "Wallets in every currency you use"],
                ["card-outline", "Your BukkaPay Visa card"],
                ["swap-horizontal-outline", "Free transfers to other BukkaPay users"],
                ["cash-outline", "Free cash deposits at BukkaPay agents"],
              ].map(([icon, text]) => (
                <View key={text} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <Ionicons name={icon as any} size={20} color={PRIMARY} />
                  <Text style={{ color: colors.text }}>{text}</Text>
                </View>
              ))}
            </View>

            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[st.label, { color: colors.textMuted }]}>When you don't pay</Text>
              <Text style={{ color: colors.text, marginTop: 6, lineHeight: 20 }}>
                • Your first month{"\n"}
                {plan.waivedWhen.includes("inactive_month") ? "• Months when you don't use BukkaPay\n" : ""}
                • Months your balance can't cover it (we never charge into debt)
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  big: { fontSize: 36, fontWeight: "900", marginVertical: 6 },
});
