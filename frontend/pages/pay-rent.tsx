import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform, Image, Share, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { getCurrentUser } from "../lib/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../lib/config";
import { useTheme } from "../lib/ThemeContext";
import PinPrompt from "../components/PinPrompt";

const logoImage = require("../assets/logo.png");
const PURPLE = "#7C3AED";
const PURPLE_LIGHT = "#EDE9FE";
const GREEN = "#10B981";
const RED = "#EF4444";
const AMBER = "#F59E0B";

interface PaymentLinkDetails {
  id: string;
  linkCode: string;
  amount: string;
  rentMonth: string;
  status: string;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  propertyType: string;
  propertyAddress: string;
  unitNumber: string;
  landlordBusinessName: string;
}

function formatMonth(rentMonth: string) {
  const [year, month] = rentMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getPropertyIcon(propertyType: string = "", name: string = ""): keyof typeof Ionicons.glyphMap {
  // The property_type enum (apartment/house/commercial/other) has no
  // dedicated hostel/student-housing category, so name hints still refine
  // the icon for those cases; everything else is driven by the real field
  // instead of guessing from the display name.
  const lower = name.toLowerCase();
  if (lower.includes("hostel") || lower.includes("dorm")) return "bed-outline";
  if (lower.includes("student") || lower.includes("res") || lower.includes("campus")) return "school-outline";
  switch (propertyType) {
    case "apartment": return "business-outline";
    case "house": return "home-outline";
    case "commercial": return "storefront-outline";
    default: return "home-outline";
  }
}

function getUnitLabel(unitNumber: string = ""): string {
  const n = unitNumber.toLowerCase();
  if (/^\d+[a-z]?$/.test(n)) return `Room ${unitNumber}`;
  if (n.startsWith("unit")) return unitNumber;
  return `Unit ${unitNumber}`;
}

export default function PayRent() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ linkCode: string }>();
  const linkCode = params.linkCode;
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [receiptVisible, setReceiptVisible] = useState(false);

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

  // react-native-web's Alert.alert() is a no-op — it never shows a dialog or
  // fires button callbacks — so this screen's payment confirmation and error
  // dialogs silently did nothing on the web build (the actual surface a
  // shared rent-payment link opens on). Route web through window.confirm /
  // window.alert instead; native platforms keep the real Alert.
  const notify = (title: string, message?: string) => {
    if (Platform.OS === "web") { window.alert(message ? `${title}\n\n${message}` : title); return; }
    Alert.alert(title, message);
  };

  const payMutation = useMutation({
    mutationFn: (pin: string) => apiRequest("POST", `/api/rental/payment-links/${linkCode}/pay`, { pin }),
    onSuccess: () => setPaymentSuccess(true),
  });

  const [showPinPrompt, setShowPinPrompt] = useState(false);

  const handlePayNow = async () => {
    if (!user) {
      await AsyncStorage.setItem("redirectAfterLogin", `/pay-rent/${linkCode}`);
      router.push("/(auth)/login" as any);
      return;
    }
    const message = `Pay R${parseFloat(paymentLink?.amount || "0").toFixed(2)} for ${formatMonth(paymentLink?.rentMonth || "")}\nat ${paymentLink?.propertyName}?`;
    if (Platform.OS === "web") {
      if (window.confirm(`Confirm Payment\n\n${message}`)) setShowPinPrompt(true);
      return;
    }
    Alert.alert("Confirm Payment", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Pay Now", style: "default", onPress: () => setShowPinPrompt(true) },
    ]);
  };

  const handlePinSubmit = async (pin: string) => {
    await payMutation.mutateAsync(pin);
    setShowPinPrompt(false);
  };

  const handleShare = async () => {
    if (!paymentLink) return;
    try {
      await Share.share({
        message: `Pay rent at ${paymentLink.propertyName} via BukkaPay:\nhttps://app.bukkapay.com/pay-rent/${linkCode}`,
      });
    } catch {}
  };

  if (isLoading) {
    return (
      <View style={[s.fullCenter, { backgroundColor: colors.background }]}>
        <View style={s.loadingCard}>
          <Image source={logoImage} style={s.loadingLogo} resizeMode="cover" />
          <Text style={s.loadingBrand}>BukkaPay</Text>
          <ActivityIndicator size="large" color={PURPLE} style={{ marginTop: 20 }} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading payment details…</Text>
        </View>
      </View>
    );
  }

  if (error || !paymentLink) {
    return (
      <View style={[s.fullCenter, { backgroundColor: colors.background }]}>
        <View style={[s.loadingCard, { alignItems: "center" }]}>
          <View style={s.errorCircle}>
            <Ionicons name="alert-circle" size={44} color={RED} />
          </View>
          <Text style={s.errorTitle}>Link Unavailable</Text>
          <Text style={[s.errorSub, { color: colors.textSecondary }]}>
            {(error as Error)?.message || "This payment link is no longer valid."}
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/(tabs)")}>
            <Ionicons name="home-outline" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>
        <PoweredByBukkaPay />
      </View>
    );
  }

  const amount = parseFloat(paymentLink.amount);
  const isPaid = paymentLink.status === "paid";
  const propIcon = getPropertyIcon(paymentLink.propertyType, paymentLink.propertyName);
  const unitLabel = getUnitLabel(paymentLink.unitNumber);

  if (paymentSuccess) {
    return (
      <View style={[s.fullCenter, { backgroundColor: colors.background }]}>
        <View style={[s.loadingCard, { alignItems: "center" }]}>
          <View style={s.successCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Payment Successful!</Text>
          <Text style={[s.successSub, { color: colors.textSecondary }]}>
            R{amount.toFixed(2)} for {formatMonth(paymentLink.rentMonth)}
          </Text>

          {/* Digital Receipt */}
          <View style={s.receiptBox}>
            <ReceiptRow label="Property" value={paymentLink.propertyName} />
            <ReceiptRow label={unitLabel.startsWith("Room") ? "Room" : "Unit"} value={paymentLink.unitNumber} />
            <ReceiptRow label="Period" value={formatMonth(paymentLink.rentMonth)} />
            <ReceiptRow label="Landlord" value={paymentLink.landlordBusinessName} />
            <ReceiptRow label="Reference" value={`BKP-${linkCode?.slice(0, 8).toUpperCase()}`} mono />
            <ReceiptRow label="Status" value="PAID" green />
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/(tabs)")}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.outlineBtn} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={16} color={PURPLE} />
            <Text style={s.outlineBtnText}>Share Receipt</Text>
          </TouchableOpacity>
        </View>
        <PoweredByBukkaPay />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={s.page}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Image source={logoImage} style={s.headerLogo} resizeMode="cover" />
          <Text style={s.headerBrand}>BukkaPay</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={s.shareBtn}>
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Property Hero ── */}
      <View style={s.heroWrap}>
        <View style={s.heroIconCircle}>
          <Ionicons name={propIcon} size={32} color="#fff" />
        </View>
        <Text style={s.heroPropertyName}>{paymentLink.propertyName}</Text>
        {paymentLink.propertyAddress ? (
          <Text style={s.heroAddress}>{paymentLink.propertyAddress}</Text>
        ) : null}

        {/* Amount pill */}
        <View style={s.amountPill}>
          <Text style={s.amountPillLabel}>Rent Due</Text>
          <Text style={s.amountPillValue}>R{amount.toFixed(2)}</Text>
          <Text style={s.amountPillPeriod}>{formatMonth(paymentLink.rentMonth)}</Text>
        </View>

        {/* Status badge */}
        {isPaid ? (
          <View style={s.paidBadge}>
            <Ionicons name="checkmark-circle" size={16} color={GREEN} />
            <Text style={s.paidBadgeText}>PAID</Text>
          </View>
        ) : (
          <View style={s.pendingBadge}>
            <Ionicons name="time-outline" size={14} color={AMBER} />
            <Text style={s.pendingBadgeText}>OUTSTANDING</Text>
          </View>
        )}
      </View>

      {/* ── Tenant & Unit Details ── */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={s.cardHeader}>
          <Ionicons name="person-circle-outline" size={20} color={PURPLE} />
          <Text style={[s.cardTitle, { color: colors.text }]}>Occupant Details</Text>
        </View>
        <View style={s.detailsGrid}>
          <DetailCell icon="bed-outline" label="Room / Unit" value={unitLabel} colors={colors} />
          <DetailCell icon="person-outline" label="Tenant" value={paymentLink.tenantName} colors={colors} />
          {paymentLink.tenantEmail ? (
            <DetailCell icon="mail-outline" label="Email" value={paymentLink.tenantEmail} colors={colors} />
          ) : null}
          <DetailCell icon="business-outline" label="Managed by" value={paymentLink.landlordBusinessName} colors={colors} />
        </View>
      </View>

      {/* ── Payment Summary Card ── */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={s.cardHeader}>
          <Ionicons name="receipt-outline" size={20} color={PURPLE} />
          <Text style={[s.cardTitle, { color: colors.text }]}>Payment Summary</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>Monthly Rent</Text>
          <Text style={[s.summaryValue, { color: colors.text }]}>R{amount.toFixed(2)}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>Period</Text>
          <Text style={[s.summaryValue, { color: colors.text }]}>{formatMonth(paymentLink.rentMonth)}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>Reference</Text>
          <Text style={[s.summaryMono, { color: colors.textMuted }]}>BKP-{linkCode?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <View style={[s.summaryRow, s.summaryRowLast]}>
          <Text style={[s.summaryLabel, { color: colors.textSecondary }]}>Payment Method</Text>
          <View style={s.methodChip}>
            <Ionicons name="wallet-outline" size={13} color={PURPLE} />
            <Text style={s.methodChipText}>BukkaPay Wallet</Text>
          </View>
        </View>
      </View>

      {/* ── Warning if not logged in ── */}
      {!user && !isPaid && (
        <View style={s.warningCard}>
          <Ionicons name="information-circle" size={20} color={AMBER} />
          <View style={{ flex: 1 }}>
            <Text style={s.warningTitle}>Sign in required</Text>
            <Text style={s.warningText}>Log in or create a free BukkaPay account to pay from your wallet.</Text>
          </View>
        </View>
      )}

      {/* ── Already paid banner ── */}
      {isPaid && (
        <View style={s.paidBanner}>
          <Ionicons name="checkmark-circle" size={22} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={s.paidBannerTitle}>This rent is paid</Text>
            <Text style={s.paidBannerSub}>Thank you! Your payment for {formatMonth(paymentLink.rentMonth)} has been confirmed.</Text>
          </View>
        </View>
      )}

      {/* ── Trust row ── */}
      <View style={s.trustRow}>
        <TrustChip icon="lock-closed" label="256-bit SSL" />
        <TrustChip icon="shield-checkmark" label="PCI Secure" />
        <TrustChip icon="checkmark-circle" label="Verified" />
      </View>

      <PoweredByBukkaPay />

      <View style={{ height: 20 }} />
    </ScrollView>

    {/* ── Sticky Pay Bar ── */}
    {!isPaid && (
      <View style={s.stickyBar}>
        <View>
          <Text style={s.stickyLabel}>Amount Due</Text>
          <Text style={s.stickyAmount}>R{amount.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[s.stickyBtn, payMutation.isPending && { opacity: 0.7 }]}
          onPress={handlePayNow}
          disabled={payMutation.isPending}
        >
          {payMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="wallet" size={18} color="#fff" />
              <Text style={s.stickyBtnText}>{user ? `Pay R${amount.toFixed(2)}` : "Sign In to Pay"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    )}

    <PinPrompt
      visible={showPinPrompt}
      subtitle={`Confirm rent payment of R${amount.toFixed(2)}`}
      onCancel={() => setShowPinPrompt(false)}
      onSubmit={handlePinSubmit}
    />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailCell({ icon, label, value, colors }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: any;
}) {
  return (
    <View style={s.detailCell}>
      <View style={s.detailCellIcon}>
        <Ionicons name={icon} size={16} color={PURPLE} />
      </View>
      <Text style={[s.detailCellLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.detailCellValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ReceiptRow({ label, value, mono, green }: { label: string; value: string; mono?: boolean; green?: boolean }) {
  return (
    <View style={s.receiptRow}>
      <Text style={s.receiptLabel}>{label}</Text>
      <Text style={[s.receiptValue, mono && s.receiptMono, green && { color: GREEN }]}>{value}</Text>
    </View>
  );
}

function TrustChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={s.trustChip}>
      <Ionicons name={icon} size={12} color={GREEN} />
      <Text style={s.trustChipText}>{label}</Text>
    </View>
  );
}

function PoweredByBukkaPay() {
  return (
    <View style={s.poweredBy}>
      <Image source={logoImage} style={s.poweredByLogo} resizeMode="cover" />
      <Text style={s.poweredByText}>Powered by BukkaPay · Secure Rent Payments</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1 },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  // Loading / error card
  loadingCard: {
    backgroundColor: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 400,
    alignItems: "center",
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8,
  },
  loadingLogo: { width: 64, height: 64, borderRadius: 18 },
  loadingBrand: { fontSize: 22, fontWeight: "800", color: "#1A1A2E", marginTop: 10 },
  loadingText: { fontSize: 13, marginTop: 12 },
  errorCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", marginBottom: 8, textAlign: "center" },
  errorSub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },

  // Success
  successCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: "800", color: "#1A1A2E", textAlign: "center", marginBottom: 4 },
  successSub: { fontSize: 15, textAlign: "center", marginBottom: 20 },
  receiptBox: { width: "100%", backgroundColor: "#F9FAFB", borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#E5E7EB" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  receiptLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  receiptValue: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  receiptMono: { fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 12 },

  // Header
  header: {
    backgroundColor: PURPLE,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { padding: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLogo: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#fff" },
  headerBrand: { fontSize: 18, fontWeight: "800", color: "#fff" },
  shareBtn: { padding: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)" },

  // Property Hero
  heroWrap: {
    backgroundColor: PURPLE,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  heroIconCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  heroPropertyName: { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 4 },
  heroAddress: { fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center", marginBottom: 20 },

  amountPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 14,
  },
  amountPillLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginBottom: 4 },
  amountPillValue: { fontSize: 38, fontWeight: "900", color: "#fff" },
  amountPillPeriod: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 },

  paidBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ECFDF5", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  paidBadgeText: { fontSize: 12, fontWeight: "800", color: GREEN, letterSpacing: 0.5 },
  pendingBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  pendingBadgeText: { fontSize: 12, fontWeight: "800", color: "#FDE68A", letterSpacing: 0.5 },

  // Cards
  card: {
    marginHorizontal: 16,
    marginTop: -20,
    marginBottom: 12,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: "700" },

  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailCell: { width: "47%", backgroundColor: "#F9FAFB", borderRadius: 14, padding: 12, gap: 4 },
  detailCellIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: PURPLE_LIGHT, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  detailCellLabel: { fontSize: 11, fontWeight: "600" },
  detailCellValue: { fontSize: 13, fontWeight: "700" },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { fontSize: 13, fontWeight: "500" },
  summaryValue: { fontSize: 14, fontWeight: "700" },
  summaryMono: { fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  methodChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: PURPLE_LIGHT, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  methodChipText: { fontSize: 12, fontWeight: "600", color: PURPLE },

  // Warning
  warningCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 16, marginBottom: 12, padding: 14,
    backgroundColor: "#FFFBEB", borderRadius: 14,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  warningTitle: { fontSize: 13, fontWeight: "700", color: "#92400E", marginBottom: 2 },
  warningText: { fontSize: 12, color: "#B45309", lineHeight: 18 },

  // Paid banner
  paidBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    backgroundColor: "#ECFDF5", borderRadius: 14,
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  paidBannerTitle: { fontSize: 14, fontWeight: "700", color: "#065F46", marginBottom: 2 },
  paidBannerSub: { fontSize: 12, color: "#047857", lineHeight: 18 },

  // Trust row
  trustRow: {
    flexDirection: "row", justifyContent: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 16, marginTop: 4,
  },
  trustChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ECFDF5", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  trustChipText: { fontSize: 11, fontWeight: "600", color: GREEN },

  // Powered by
  poweredBy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 },
  poweredByLogo: { width: 18, height: 18, borderRadius: 5 },
  poweredByText: { fontSize: 11, color: "#9CA3AF", fontWeight: "500" },

  // Sticky bar
  stickyBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1, borderColor: "#EDE9FE",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  stickyLabel: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  stickyAmount: { fontSize: 22, fontWeight: "900", color: "#1A1A2E" },
  stickyBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22,
    flexDirection: "row", alignItems: "center", gap: 8,
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  stickyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Buttons
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 15,
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    marginBottom: 10, width: "100%",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: PURPLE, borderRadius: 14, paddingVertical: 13,
    width: "100%",
  },
  outlineBtnText: { color: PURPLE, fontSize: 14, fontWeight: "700" },
});

// ─── Sticky Pay Bar (outside scroll) rendered by wrapper ─────────────────────
// This is a standalone export for when the page is used via the dynamic route
export function StickyPayBar({ paymentLink, user, isPaying, onPay, onLogin }: {
  paymentLink: PaymentLinkDetails;
  user: any;
  isPaying: boolean;
  onPay: () => void;
  onLogin: () => void;
}) {
  const isPaid = paymentLink.status === "paid";
  const amount = parseFloat(paymentLink.amount);

  return (
    <View style={stickyStyles.bar}>
      <View>
        <Text style={stickyStyles.label}>Amount Due</Text>
        <Text style={stickyStyles.amount}>R{amount.toFixed(2)}</Text>
      </View>
      <TouchableOpacity
        style={[stickyStyles.btn, isPaid && stickyStyles.btnDisabled]}
        onPress={user ? onPay : onLogin}
        disabled={isPaying || isPaid}
      >
        {isPaying ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Ionicons name={isPaid ? "checkmark-circle" : "wallet"} size={18} color="#fff" />
            <Text style={stickyStyles.btnText}>
              {isPaid ? "Already Paid" : user ? "Pay Now" : "Sign In to Pay"}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const stickyStyles = StyleSheet.create({
  bar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1, borderColor: "#EDE9FE",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  label: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  amount: { fontSize: 22, fontWeight: "900", color: "#1A1A2E" },
  btn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 24,
    flexDirection: "row", alignItems: "center", gap: 8,
    shadowColor: PURPLE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
