import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { getCurrentUser } from "../lib/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../lib/config";
import { useTheme } from "../lib/ThemeContext";
import { useCurrency } from "../lib/CurrencyContext";
import { convertAmount } from "../lib/currency";

interface PaymentLinkDetails {
  id: string;
  linkCode: string;
  amount: string;
  rentMonth: string;
  status: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  propertyAddress: string;
  unitNumber: string;
  landlordBusinessName: string;
}

function formatMonth(rentMonth: string) {
  const [year, month] = rentMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function PayRent() {
  const router = useRouter();
  const { colors } = useTheme();
  const { currency } = useCurrency();
  const params = useLocalSearchParams<{ linkCode: string }>();
  const linkCode = params.linkCode;
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  const { data: paymentLink, isLoading, error } = useQuery<PaymentLinkDetails>({
    queryKey: ["/api/rental/payment-links", linkCode],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/rental/payment-links/${linkCode}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Payment link not found");
      }
      return res.json();
    },
    enabled: !!linkCode,
  });

  const payMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rental/payment-links/${linkCode}/pay`, {}),
    onSuccess: () => setPaymentSuccess(true),
    onError: (err: Error) => Alert.alert("Payment Failed", err.message || "Please try again"),
  });

  const handlePayNow = async () => {
    if (!user) {
      await AsyncStorage.setItem("redirectAfterLogin", `/pay-rent/${linkCode}`);
      router.push("/(screens)/login" as any);
      return;
    }
    payMutation.mutate();
  };

  const amountUSD = paymentLink ? parseFloat(paymentLink.amount) : 0;
  const displayAmount = `${currency.symbol}${convertAmount(amountUSD, currency.code).toFixed(2)}`;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !paymentLink) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.simpleHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Link</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <View style={[styles.errorCircle, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
          </View>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Invalid or Expired Link</Text>
          <Text style={[styles.errorSub, { color: colors.textSecondary }]}>
            {(error as Error)?.message || "This payment link is no longer valid."}
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.primaryBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (paymentSuccess) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, flex: 1 }]}>
        <View style={[styles.successCircle, { backgroundColor: "#10B981" }]}>
          <Ionicons name="checkmark" size={48} color="#FFFFFF" />
        </View>
        <Text style={[styles.successTitle, { color: colors.text }]}>Payment Successful!</Text>
        <Text style={[styles.successSub, { color: colors.textSecondary }]}>
          {displayAmount} paid for {formatMonth(paymentLink.rentMonth)}
        </Text>
        <Text style={[styles.successDetail, { color: colors.textMuted }]}>
          {paymentLink.propertyName} · Unit {paymentLink.unitNumber}
        </Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 24 }]} onPress={() => router.push("/(tabs)")}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.simpleHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pay Rent</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Amount hero */}
        <View style={[styles.amountHero, { backgroundColor: colors.primary }]}>
          <Ionicons name="home" size={28} color="rgba(255,255,255,0.8)" />
          <Text style={styles.amountLabel}>Amount Due</Text>
          <Text style={styles.amountValue}>{displayAmount}</Text>
          <Text style={styles.amountMonth}>For {formatMonth(paymentLink.rentMonth)}</Text>
        </View>

        {/* Property details */}
        <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.detailCardTitle, { color: colors.text }]}>Payment Details</Text>
          {[
            { label: "Property", value: paymentLink.propertyName },
            { label: "Address", value: paymentLink.propertyAddress },
            { label: "Unit", value: paymentLink.unitNumber },
            { label: "Landlord", value: paymentLink.landlordBusinessName },
            { label: "Tenant", value: paymentLink.tenantName },
          ].filter(r => r.value).map((row) => (
            <View key={row.label} style={[styles.detailRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Status badge */}
        {paymentLink.status === "paid" && (
          <View style={styles.paidBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.paidText}>This rent has already been paid.</Text>
          </View>
        )}

        {!user && (
          <View style={[styles.warningCard, { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" }]}>
            <Ionicons name="information-circle-outline" size={18} color="#D97706" />
            <Text style={[styles.warningText, { color: "#92400E" }]}>
              Log in or create an account to pay from your BukkaPay wallet.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.payBtn,
            { backgroundColor: paymentLink.status === "paid" ? colors.border : colors.primary },
            payMutation.isPending && { opacity: 0.6 },
          ]}
          onPress={handlePayNow}
          disabled={payMutation.isPending || paymentLink.status === "paid"}
        >
          {payMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.payBtnText}>
                {paymentLink.status === "paid" ? "Already Paid"
                  : user ? `Pay ${displayAmount}`
                  : "Log In to Pay"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {user && paymentLink.status !== "paid" && (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Payment will be deducted from your BukkaPay wallet
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  simpleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  body: { paddingHorizontal: 24, paddingBottom: 60 },
  amountHero: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginVertical: 20,
    gap: 4,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  amountLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 8 },
  amountValue: { fontSize: 40, fontWeight: "800", color: "#fff", marginTop: 4 },
  amountMonth: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  detailCardTitle: { fontSize: 15, fontWeight: "700", padding: 16, paddingBottom: 12 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600", maxWidth: "55%", textAlign: "right" },
  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  paidText: { color: "#047857", fontWeight: "600", fontSize: 14 },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  warningText: { flex: 1, fontSize: 13, lineHeight: 19 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    height: 56,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  payBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  hintText: { textAlign: "center", fontSize: 12, marginTop: 12 },
  errorCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  errorTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  errorSub: { fontSize: 14, textAlign: "center", marginBottom: 28, lineHeight: 20 },
  successCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  successSub: { fontSize: 16, textAlign: "center", marginBottom: 4 },
  successDetail: { fontSize: 13, textAlign: "center" },
  primaryBtn: { borderRadius: 12, height: 52, paddingHorizontal: 32, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
