import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Modal, Share, Alert, Dimensions,
  RefreshControl, Image, TextInput, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";

const logoImage = require("../assets/logo.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Merchant {
  id: string;
  businessName: string;
  businessType: string;
  businessCategory?: string;
  qrCode: string;
  paymentLink: string;
  walletBalance: string;
  isActive: boolean;
  dailyLimit: string;
  createdAt: string;
}

interface MerchantTransaction {
  id: string;
  merchantId: string;
  payerId?: string;
  payerName?: string;
  amount: string;
  currency?: string;
  type: string;
  status: string;
  reference?: string;
  createdAt: string;
}

interface Analytics {
  summary: {
    todayRevenue: number;
    todayCount: number;
    weekRevenue: number;
    weekCount: number;
    monthRevenue: number;
    monthCount: number;
    totalRevenue: number;
    totalCount: number;
    avgTransaction: number;
    revenueGrowth: number;
  };
  customers: {
    total: number;
    thisMonth: number;
    topCustomers: { name: string; total: number; count: number }[];
  };
  dailyChart: { date: string; amount: number; count: number }[];
  statusBreakdown: { completed: number; pending: number; failed: number };
  dailyLimit: { limit: number; used: number; remaining: number; percentUsed: number };
}

interface PaymentLink {
  id: string;
  amount: string;
  currency: string;
  description?: string;
  status: string;
  totalRaised?: string;
  paymentCount?: number;
  createdAt: string;
}

type TabKey = "overview" | "transactions" | "customers";

// ─── Country / Banking Config ─────────────────────────────────────────────────

interface CountryBankConfig {
  flag: string;
  name: string;
  currency: string;
  fields: ("bank_name" | "branch_code" | "sort_code" | "routing_number" | "iban" | "bic" | "bank_code" | "mpesa")[];
  accountNumberLabel: string;
  accountNumberPlaceholder: string;
  extraLabel?: Record<string, string>;
}

const COUNTRY_BANK_CONFIG: Record<string, CountryBankConfig> = {
  ZA: {
    flag: "🇿🇦", name: "South Africa", currency: "ZAR",
    fields: ["bank_name", "branch_code"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "e.g. 1234567890",
    extraLabel: { branch_code: "Branch Code (6 digits)" },
  },
  NG: {
    flag: "🇳🇬", name: "Nigeria", currency: "NGN",
    fields: ["bank_name", "bank_code"],
    accountNumberLabel: "Account Number (NUBAN)",
    accountNumberPlaceholder: "10-digit NUBAN",
    extraLabel: { bank_code: "Bank Code (3 digits)" },
  },
  KE: {
    flag: "🇰🇪", name: "Kenya", currency: "KES",
    fields: ["bank_name", "branch_code"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "e.g. 0123456789",
    extraLabel: { branch_code: "Branch Code" },
  },
  GH: {
    flag: "🇬🇭", name: "Ghana", currency: "GHS",
    fields: ["bank_name", "branch_code"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "e.g. 0123456789",
    extraLabel: { branch_code: "Branch Code" },
  },
  ZW: {
    flag: "🇿🇼", name: "Zimbabwe", currency: "USD",
    fields: ["bank_name", "branch_code"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "e.g. 0123456789",
    extraLabel: { branch_code: "Branch Code" },
  },
  GB: {
    flag: "🇬🇧", name: "United Kingdom", currency: "GBP",
    fields: ["sort_code"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "8 digits, e.g. 12345678",
    extraLabel: { sort_code: "Sort Code (xx-xx-xx)" },
  },
  US: {
    flag: "🇺🇸", name: "United States", currency: "USD",
    fields: ["bank_name", "routing_number"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "e.g. 000123456789",
    extraLabel: { routing_number: "Routing Number (9 digits)" },
  },
  EU: {
    flag: "🇪🇺", name: "Europe (SEPA)", currency: "EUR",
    fields: ["iban", "bic"],
    accountNumberLabel: "Account Number (optional if IBAN provided)",
    accountNumberPlaceholder: "Leave blank if IBAN provided",
    extraLabel: { iban: "IBAN", bic: "BIC / SWIFT Code" },
  },
  OTHER: {
    flag: "🌍", name: "Other Country", currency: "USD",
    fields: ["bank_name", "bic", "iban"],
    accountNumberLabel: "Account Number",
    accountNumberPlaceholder: "Your bank account number",
    extraLabel: { bic: "SWIFT / BIC Code", iban: "IBAN (if applicable)" },
  },
};

const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "NGN", "KES", "GHS"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(val: number, symbol = "$") {
  if (val >= 1_000_000) return `${symbol}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${symbol}${(val / 1_000).toFixed(1)}K`;
  return `${symbol}${val.toFixed(2)}`;
}

function currencySymbol(currency: string) {
  const map: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£", NGN: "₦", KES: "KSh", GHS: "₵" };
  return map[currency] ?? currency;
}

function getStatusColor(status: string) {
  if (status === "completed") return "#10B981";
  if (status === "pending") return "#F59E0B";
  return "#EF4444";
}

function getStatusIcon(status: string): keyof typeof Ionicons.glyphMap {
  if (status === "completed") return "checkmark-circle";
  if (status === "pending") return "time";
  return "close-circle";
}

function getDayLabel(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en", { weekday: "short" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MerchantDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);

  // Generate link state
  const [showGenerateLink, setShowGenerateLink] = useState(false);
  const [genAmount, setGenAmount] = useState("");
  const [genDesc, setGenDesc] = useState("");
  const [genCurrency, setGenCurrency] = useState("ZAR");
  const [genLoading, setGenLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ id: string; url: string; amount: string; currency: string; description: string } | null>(null);

  // Withdraw state
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<"form" | "confirm" | "success">("form");
  const [wCountry, setWCountry] = useState("ZA");
  const [wBankName, setWBankName] = useState("");
  const [wAccountHolder, setWAccountHolder] = useState("");
  const [wAccountNumber, setWAccountNumber] = useState("");
  const [wBranchCode, setWBranchCode] = useState("");
  const [wSortCode, setWSortCode] = useState("");
  const [wRoutingNumber, setWRoutingNumber] = useState("");
  const [wIban, setWIban] = useState("");
  const [wBic, setWBic] = useState("");
  const [wBankCode, setWBankCode] = useState("");
  const [wAccountType, setWAccountType] = useState<"current" | "savings" | "checking">("current");
  const [wAmount, setWAmount] = useState("");
  const [wCurrency, setWCurrency] = useState("ZAR");
  const [wReference, setWReference] = useState("");
  const [wLoading, setWLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // ─── Data Queries ──────────────────────────────────────────────────────────

  const { data: merchants = [], isLoading } = useQuery<Merchant[]>({ queryKey: ["/api/merchants"] });
  const selectedMerchant = merchants.find(m => m.id === selectedMerchantId) || merchants[0];

  useEffect(() => {
    if (merchants.length > 0 && !selectedMerchantId) setSelectedMerchantId(merchants[0].id);
  }, [merchants, selectedMerchantId]);

  const { data: transactions = [] } = useQuery<MerchantTransaction[]>({
    queryKey: ["/api/merchants", selectedMerchant?.id, "transactions"],
    enabled: !!selectedMerchant?.id,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/merchants/${selectedMerchant?.id}/transactions`, {
        headers: await getAuthHeader(),
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["/api/merchants", selectedMerchant?.id, "analytics"],
    enabled: !!selectedMerchant?.id,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/merchants/${selectedMerchant?.id}/analytics`, {
        headers: await getAuthHeader(),
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: paymentLinks = [] } = useQuery<PaymentLink[]>({
    queryKey: ["/api/payment-links"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/payment-links`, { headers: await getAuthHeader() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ─── Computed Metrics ──────────────────────────────────────────────────────

  const healthScore = useMemo(() => {
    if (!analytics) return null;
    const total = analytics.statusBreakdown.completed + analytics.statusBreakdown.pending + analytics.statusBreakdown.failed;
    const successRate = total > 0 ? (analytics.statusBreakdown.completed / total) * 100 : 100;
    const growthScore = Math.max(0, Math.min(100, 50 + (analytics.summary.revenueGrowth || 0)));
    const customerScore = analytics.customers.total > 0 ? Math.min(100, analytics.customers.total * 5) : 0;
    const score = Math.round(successRate * 0.5 + growthScore * 0.3 + customerScore * 0.2);
    let label = "Poor";
    let color = "#EF4444";
    if (score >= 80) { label = "Excellent"; color = "#10B981"; }
    else if (score >= 60) { label = "Good"; color = "#3B82F6"; }
    else if (score >= 40) { label = "Fair"; color = "#F59E0B"; }
    return { score, label, color };
  }, [analytics]);

  const topLinks = useMemo(() =>
    [...paymentLinks]
      .filter(l => l.status === "active" || parseFloat(l.totalRaised ?? "0") > 0)
      .sort((a, b) => parseFloat(b.totalRaised ?? b.amount) - parseFloat(a.totalRaised ?? a.amount))
      .slice(0, 3),
    [paymentLinks]
  );

  const chartMax = analytics ? Math.max(...analytics.dailyChart.map(d => d.amount), 1) : 1;
  const balance = parseFloat(selectedMerchant?.walletBalance || "0");
  const sym = currencySymbol("ZAR");

  // ─── Actions ───────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/payment-links"] });
    if (selectedMerchant?.id) {
      await queryClient.invalidateQueries({ queryKey: ["/api/merchants", selectedMerchant.id, "transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/merchants", selectedMerchant.id, "analytics"] });
    }
    setRefreshing(false);
  }, [queryClient, selectedMerchant?.id]);

  const sharePaymentLink = async () => {
    const link = `${API_BASE}/merchant-pay/${selectedMerchant?.paymentLink}`;
    try { await Share.share({ message: `Pay ${selectedMerchant?.businessName} via BukkaPay: ${link}` }); } catch {}
  };

  const copyPaymentLink = async () => {
    const link = `${API_BASE}/merchant-pay/${selectedMerchant?.paymentLink}`;
    await Clipboard.setStringAsync(link);
    Alert.alert("Copied", "Payment link copied!");
  };

  const generateMerchantLink = async () => {
    if (!parseFloat(genAmount) || parseFloat(genAmount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount."); return;
    }
    setGenLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          amount: genAmount, currency: genCurrency,
          description: genDesc || `Payment to ${selectedMerchant?.businessName || "Merchant"}`,
          type: "business", region: "local", destination: "wallet",
          businessName: selectedMerchant?.businessName,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to create link"); }
      const data = await res.json();
      setGeneratedLink({
        id: data.id, url: `https://app.bukkapay.com/pay/${data.id}`,
        amount: data.amount, currency: data.currency,
        description: data.description || genDesc,
      });
      setGenAmount(""); setGenDesc("");
      queryClient.invalidateQueries({ queryKey: ["/api/payment-links"] });
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setGenLoading(false); }
  };

  const submitWithdrawal = async () => {
    setWLoading(true);
    try {
      const headers = await getAuthHeader();
      const bankingDetails: any = {
        country: wCountry, accountHolder: wAccountHolder,
        accountNumber: wAccountNumber, accountType: wAccountType,
        bankName: wBankName, reference: wReference,
      };
      const cfg = COUNTRY_BANK_CONFIG[wCountry];
      if (cfg.fields.includes("branch_code")) bankingDetails.branchCode = wBranchCode;
      if (cfg.fields.includes("sort_code")) bankingDetails.sortCode = wSortCode;
      if (cfg.fields.includes("routing_number")) bankingDetails.routingNumber = wRoutingNumber;
      if (cfg.fields.includes("iban")) bankingDetails.iban = wIban;
      if (cfg.fields.includes("bic")) bankingDetails.bic = wBic;
      if (cfg.fields.includes("bank_code")) bankingDetails.bankCode = wBankCode;

      const res = await fetch(`${API_BASE}/api/merchants/${selectedMerchant?.id}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ amount: wAmount, currency: wCurrency, merchantId: selectedMerchant?.id, bankingDetails }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Withdrawal request failed. Please try again.");
      }
      setWithdrawStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
    } catch (e: any) { Alert.alert("Withdrawal Error", e.message); }
    finally { setWLoading(false); }
  };

  const resetWithdraw = () => {
    setWithdrawStep("form"); setWBankName(""); setWAccountHolder("");
    setWAccountNumber(""); setWBranchCode(""); setWSortCode("");
    setWRoutingNumber(""); setWIban(""); setWBic(""); setWBankCode("");
    setWAmount(""); setWReference(""); setWCountry("ZA"); setWCurrency("ZAR");
  };

  const deleteBusiness = (merchant: Merchant) => {
    Alert.alert(
      "Delete Business",
      `Are you sure you want to permanently delete "${merchant.businessName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const headers = await getAuthHeader();
              const res = await fetch(`${API_BASE}/api/merchants/${merchant.id}`, {
                method: "DELETE",
                headers,
              });
              if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                Alert.alert("Error", d.error || "Could not delete this business.");
                return;
              }
              queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
              if (selectedMerchantId === merchant.id) setSelectedMerchantId(null);
              setShowSwitcher(false);
            } catch {
              Alert.alert("Error", "Something went wrong. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ─── Loading / Empty States ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loaderText}>Loading your dashboard…</Text>
      </View>
    );
  }

  if (!selectedMerchant) {
    return (
      <View style={styles.loaderWrap}>
        <Ionicons name="storefront-outline" size={56} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Merchant Account</Text>
        <Text style={styles.emptySubtitle}>Set up your merchant profile to start accepting payments.</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("/(screens)/become-merchant")}>
          <Text style={styles.ctaBtnText}>Create Merchant Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render Sections ───────────────────────────────────────────────────────

  const renderOverview = () => (
    <View>
      {/* ── Premium Balance Card ── */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceCardInner}>
          <View style={styles.balanceTopRow}>
            <View>
              <Text style={styles.balanceCardLabel}>Available Balance</Text>
              <Text style={styles.balanceCardValue}>{sym}{balance.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              <Text style={styles.balanceCardSub}>{selectedMerchant.businessName}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: selectedMerchant.isActive ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }]}>
              <View style={[styles.statusDotLive, { backgroundColor: selectedMerchant.isActive ? "#10B981" : "#EF4444" }]} />
              <Text style={[styles.statusPillText, { color: selectedMerchant.isActive ? "#10B981" : "#EF4444" }]}>
                {selectedMerchant.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>

          {analytics && analytics.summary.revenueGrowth !== 0 && (
            <View style={styles.growthChip}>
              <Ionicons
                name={analytics.summary.revenueGrowth > 0 ? "trending-up" : "trending-down"}
                size={13} color={analytics.summary.revenueGrowth > 0 ? "#10B981" : "#EF4444"}
              />
              <Text style={[styles.growthChipText, { color: analytics.summary.revenueGrowth > 0 ? "#10B981" : "#EF4444" }]}>
                {analytics.summary.revenueGrowth > 0 ? "+" : ""}{analytics.summary.revenueGrowth}% this month
              </Text>
            </View>
          )}

          {/* Quick action buttons — two rows */}
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity style={styles.qaBtn} onPress={() => { setWithdrawStep("form"); setShowWithdraw(true); }}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(16,185,129,0.18)" }]}>
                <Ionicons name="arrow-up-circle" size={22} color="#10B981" />
              </View>
              <Text style={styles.qaLabel}>Withdraw</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={() => { setGeneratedLink(null); setShowGenerateLink(true); }}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(124,58,237,0.15)" }]}>
                <Ionicons name="link" size={22} color="#7C3AED" />
              </View>
              <Text style={styles.qaLabel}>Gen. Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={() => setShowQRDialog(true)}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
                <Ionicons name="qr-code" size={22} color="#3B82F6" />
              </View>
              <Text style={styles.qaLabel}>QR Code</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={sharePaymentLink}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                <Ionicons name="share-social" size={22} color="#F59E0B" />
              </View>
              <Text style={styles.qaLabel}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={copyPaymentLink}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(107,114,128,0.12)" }]}>
                <Ionicons name="copy" size={22} color="#6B7280" />
              </View>
              <Text style={styles.qaLabel}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={() => router.push("/(screens)/payment-links")}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
                <Ionicons name="list" size={22} color="#EF4444" />
              </View>
              <Text style={styles.qaLabel}>My Links</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.qaBtn} onPress={() => router.push("/(screens)/billing-links" as any)}>
              <View style={[styles.qaIcon, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
                <Ionicons name="receipt" size={22} color="#F59E0B" />
              </View>
              <Text style={styles.qaLabel}>Billing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Business Health Score ── */}
      {healthScore && (
        <View style={styles.healthCard}>
          <View style={styles.healthLeft}>
            <Text style={styles.healthTitle}>Business Health Score</Text>
            <Text style={styles.healthSub}>Based on success rate, growth & customer retention</Text>
            <View style={styles.healthBar}>
              <View style={[styles.healthBarFill, { width: `${healthScore.score}%`, backgroundColor: healthScore.color }]} />
            </View>
            <Text style={[styles.healthLabel, { color: healthScore.color }]}>{healthScore.label} — {healthScore.score}/100</Text>
          </View>
          <View style={[styles.healthScoreCircle, { borderColor: healthScore.color }]}>
            <Text style={[styles.healthScoreNum, { color: healthScore.color }]}>{healthScore.score}</Text>
            <Text style={styles.healthScoreMax}>/100</Text>
          </View>
        </View>
      )}

      {/* ── Stats Grid ── */}
      {analytics && (
        <>
          <View style={styles.statsGrid}>
            {[
              { label: "Today", value: formatCurrency(analytics.summary.todayRevenue, sym), sub: `${analytics.summary.todayCount} txns`, icon: "today", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
              { label: "This Week", value: formatCurrency(analytics.summary.weekRevenue, sym), sub: `${analytics.summary.weekCount} txns`, icon: "calendar-outline", color: "#10B981", bg: "rgba(16,185,129,0.08)" },
              { label: "This Month", value: formatCurrency(analytics.summary.monthRevenue, sym), sub: `${analytics.summary.monthCount} txns`, icon: "stats-chart", color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
              { label: "All Time", value: formatCurrency(analytics.summary.totalRevenue, sym), sub: `${analytics.summary.totalCount} txns`, icon: "wallet", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
            ].map((s, i) => (
              <View key={i} style={styles.statCard}>
                <View style={[styles.statIconBadge, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon as any} size={18} color={s.color} />
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statSub}>{s.sub}</Text>
              </View>
            ))}
          </View>

          {/* ── Key Metrics Row ── */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Ionicons name="receipt" size={16} color="#7C3AED" />
              <Text style={styles.metricValue}>{formatCurrency(analytics.summary.avgTransaction, sym)}</Text>
              <Text style={styles.metricLabel}>Avg. Transaction</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="people" size={16} color="#3B82F6" />
              <Text style={styles.metricValue}>{analytics.customers.total}</Text>
              <Text style={styles.metricLabel}>Customers</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.metricValue}>
                {(() => {
                  const total = analytics.statusBreakdown.completed + analytics.statusBreakdown.pending + analytics.statusBreakdown.failed;
                  return total > 0 ? `${Math.round((analytics.statusBreakdown.completed / total) * 100)}%` : "100%";
                })()}
              </Text>
              <Text style={styles.metricLabel}>Success Rate</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Ionicons name="person-add" size={16} color="#F59E0B" />
              <Text style={styles.metricValue}>{analytics.customers.thisMonth}</Text>
              <Text style={styles.metricLabel}>New / Month</Text>
            </View>
          </View>

          {/* ── Revenue Chart ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>REVENUE — LAST 7 DAYS</Text>
              <Ionicons name="bar-chart" size={14} color="#7C3AED" />
            </View>
            <View style={styles.chartCard}>
              {analytics.dailyChart.map((day, i) => {
                const barH = chartMax > 0 ? (day.amount / chartMax) * 72 : 0;
                const isHighest = day.amount === Math.max(...analytics.dailyChart.map(d => d.amount));
                return (
                  <View key={i} style={styles.chartBar}>
                    {day.amount > 0 && (
                      <Text style={[styles.chartBarAmt, isHighest && { color: "#7C3AED", fontWeight: "700" }]}>
                        {formatCurrency(day.amount, sym)}
                      </Text>
                    )}
                    <View style={styles.chartBarTrack}>
                      <View style={[
                        styles.chartBarFill,
                        { height: Math.max(barH, day.amount > 0 ? 4 : 2), backgroundColor: isHighest ? "#7C3AED" : "#C4B5FD" },
                      ]} />
                    </View>
                    <Text style={[styles.chartBarDay, isHighest && { color: "#7C3AED", fontWeight: "700" }]}>
                      {getDayLabel(day.date)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Top Payment Links ── */}
          {topLinks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>TOP PAYMENT LINKS</Text>
                <TouchableOpacity onPress={() => router.push("/(screens)/payment-links")}>
                  <Text style={styles.sectionAction}>View all</Text>
                </TouchableOpacity>
              </View>
              {topLinks.map((link, i) => (
                <View key={link.id} style={styles.linkRow}>
                  <View style={[styles.linkRank, { backgroundColor: i === 0 ? "#7C3AED" : i === 1 ? "#3B82F6" : "#10B981" }]}>
                    <Text style={styles.linkRankText}>#{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkDesc} numberOfLines={1}>{link.description || "Payment Link"}</Text>
                    <Text style={styles.linkMeta}>
                      {link.currency} {parseFloat(link.amount).toFixed(2)} · {link.paymentCount ?? 0} payment{link.paymentCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={styles.linkBadge}>
                    <Text style={[styles.linkBadgeText, { color: link.status === "active" ? "#10B981" : "#6B7280" }]}>
                      {link.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Transaction Status Breakdown ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PAYMENT BREAKDOWN</Text>
            </View>
            <View style={styles.breakdownCard}>
              {(() => {
                const total = analytics.statusBreakdown.completed + analytics.statusBreakdown.pending + analytics.statusBreakdown.failed;
                const items = [
                  { label: "Completed", count: analytics.statusBreakdown.completed, color: "#10B981" },
                  { label: "Pending", count: analytics.statusBreakdown.pending, color: "#F59E0B" },
                  { label: "Failed", count: analytics.statusBreakdown.failed, color: "#EF4444" },
                ];
                return items.map((item, i) => (
                  <View key={i}>
                    <View style={styles.breakdownRow}>
                      <View style={styles.breakdownLeft}>
                        <View style={[styles.breakdownDot, { backgroundColor: item.color }]} />
                        <Text style={styles.breakdownLabel}>{item.label}</Text>
                      </View>
                      <View style={styles.breakdownRight}>
                        <Text style={[styles.breakdownCount, { color: item.color }]}>{item.count}</Text>
                        <Text style={styles.breakdownPct}>
                          {total > 0 ? `${Math.round((item.count / total) * 100)}%` : "0%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.breakdownBarTrack}>
                      <View style={[styles.breakdownBarFill, {
                        width: total > 0 ? `${(item.count / total) * 100}%` : "0%",
                        backgroundColor: item.color,
                      }]} />
                    </View>
                  </View>
                ));
              })()}
            </View>
          </View>

          {/* ── Daily Limit ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>DAILY TRANSACTION LIMIT</Text>
            </View>
            <View style={styles.limitCard}>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Used Today</Text>
                <Text style={styles.limitVal}>{formatCurrency(analytics.dailyLimit.used, sym)} / {formatCurrency(analytics.dailyLimit.limit, sym)}</Text>
              </View>
              <View style={styles.limitBarTrack}>
                <View style={[styles.limitBarFill, {
                  width: `${Math.min(analytics.dailyLimit.percentUsed, 100)}%`,
                  backgroundColor: analytics.dailyLimit.percentUsed > 80 ? "#EF4444" : analytics.dailyLimit.percentUsed > 50 ? "#F59E0B" : "#10B981",
                }]} />
              </View>
              <Text style={styles.limitRemaining}>{formatCurrency(analytics.dailyLimit.remaining, sym)} remaining today</Text>
            </View>
          </View>
        </>
      )}

      {/* ── Merchant Info ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MERCHANT PROFILE</Text>
        <View style={styles.infoCard}>
          {[
            { label: "Business Type", value: selectedMerchant.businessType.replace(/_/g, " ") },
            ...(selectedMerchant.businessCategory ? [{ label: "Category", value: selectedMerchant.businessCategory }] : []),
            { label: "QR Code", value: selectedMerchant.qrCode, mono: true },
            { label: "Member Since", value: new Date(selectedMerchant.createdAt).toLocaleDateString("en", { month: "long", year: "numeric" }) },
          ].map((row, i, arr) => (
            <View key={i} style={[styles.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={row.mono ? styles.infoMono : styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {selectedMerchant.businessType.toLowerCase() === "property" && (
        <TouchableOpacity style={styles.landlordBtn} onPress={() => router.push("/(screens)/landlord-dashboard")}>
          <Ionicons name="business" size={16} color="#7C3AED" />
          <Text style={styles.landlordBtnText}>Manage Properties & Tenants</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderTransactions = () => (
    <View>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptySubtitle}>Share your QR code or payment link to start receiving payments.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.txSectionHeader}>{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</Text>
          {transactions.map((tx) => (
            <View key={tx.id} style={styles.txItem}>
              <View style={[styles.txIcon, { backgroundColor: `${getStatusColor(tx.status)}15` }]}>
                <Ionicons name={getStatusIcon(tx.status)} size={20} color={getStatusColor(tx.status)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txName}>{tx.payerName || "Anonymous"}</Text>
                <Text style={styles.txDate}>
                  {new Date(tx.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })} · {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {tx.reference && <Text style={styles.txRef}>Ref: {tx.reference}</Text>}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.txAmount, { color: getStatusColor(tx.status) }]}>
                  +{currencySymbol(tx.currency ?? "ZAR")}{parseFloat(tx.amount).toFixed(2)}
                </Text>
                <View style={[styles.txBadge, { backgroundColor: `${getStatusColor(tx.status)}15` }]}>
                  <Text style={[styles.txBadgeText, { color: getStatusColor(tx.status) }]}>{tx.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );

  const renderCustomers = () => (
    <View>
      {analytics && analytics.customers.topCustomers.length > 0 ? (
        <>
          <View style={styles.customerSummaryRow}>
            <View style={styles.customerSummaryCard}>
              <Ionicons name="people" size={28} color="#7C3AED" />
              <Text style={styles.customerSummaryNum}>{analytics.customers.total}</Text>
              <Text style={styles.customerSummaryLbl}>Total Customers</Text>
            </View>
            <View style={styles.customerSummaryCard}>
              <Ionicons name="person-add" size={28} color="#10B981" />
              <Text style={styles.customerSummaryNum}>{analytics.customers.thisMonth}</Text>
              <Text style={styles.customerSummaryLbl}>New This Month</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>TOP CUSTOMERS</Text>
          {analytics.customers.topCustomers.map((c, i) => (
            <View key={i} style={styles.customerRow}>
              <View style={[styles.customerRankBadge, { backgroundColor: i === 0 ? "#7C3AED" : i === 1 ? "#3B82F6" : "#10B981" }]}>
                <Text style={styles.customerRankText}>{i + 1}</Text>
              </View>
              <View style={[styles.customerAvatar, { backgroundColor: ["#EDE9FE","#DBEAFE","#D1FAE5","#FEF3C7","#FEE2E2"][i % 5] }]}>
                <Text style={[styles.customerAvatarText, { color: ["#7C3AED","#3B82F6","#10B981","#F59E0B","#EF4444"][i % 5] }]}>
                  {c.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{c.name}</Text>
                <Text style={styles.customerMeta}>{c.count} payment{c.count !== 1 ? "s" : ""}</Text>
              </View>
              <Text style={styles.customerTotal}>{formatCurrency(c.total, sym)}</Text>
            </View>
          ))}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No customers yet</Text>
          <Text style={styles.emptySubtitle}>Customers appear here once they make payments through your links or QR code.</Text>
        </View>
      )}
    </View>
  );

  // ─── Withdraw Modal Content ────────────────────────────────────────────────

  const bankCfg = COUNTRY_BANK_CONFIG[wCountry];

  const renderWithdrawForm = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.withdrawSubtitle}>
        Funds will be transferred from your merchant wallet to your bank account within 1–3 business days.
      </Text>

      {/* Amount + Currency */}
      <Text style={styles.wLabel}>Withdrawal Amount *</Text>
      <View style={styles.wAmountRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 0, maxHeight: 44 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {CURRENCIES.map(c => (
              <TouchableOpacity key={c} style={[styles.wChip, wCurrency === c && styles.wChipActive]} onPress={() => setWCurrency(c)}>
                <Text style={[styles.wChipText, wCurrency === c && styles.wChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <TextInput
        style={styles.wInput} value={wAmount} onChangeText={setWAmount}
        placeholder={`0.00 ${wCurrency}`} keyboardType="decimal-pad" placeholderTextColor="#9CA3AF"
      />
      <Text style={styles.wBalanceHint}>Available: {sym}{balance.toFixed(2)}</Text>

      {/* Country Selector */}
      <Text style={[styles.wLabel, { marginTop: 14 }]}>Country *</Text>
      <TouchableOpacity style={styles.wCountryBtn} onPress={() => setShowCountryPicker(!showCountryPicker)}>
        <Text style={styles.wCountryBtnText}>{bankCfg.flag} {bankCfg.name}</Text>
        <Ionicons name={showCountryPicker ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
      </TouchableOpacity>
      {showCountryPicker && (
        <View style={styles.countryPickerList}>
          {Object.entries(COUNTRY_BANK_CONFIG).map(([code, cfg]) => (
            <TouchableOpacity
              key={code}
              style={[styles.countryPickerItem, wCountry === code && styles.countryPickerItemActive]}
              onPress={() => { setWCountry(code); setShowCountryPicker(false); }}
            >
              <Text style={styles.countryPickerFlag}>{cfg.flag}</Text>
              <Text style={[styles.countryPickerName, wCountry === code && { color: "#7C3AED", fontWeight: "700" }]}>{cfg.name}</Text>
              {wCountry === code && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Account Holder */}
      <Text style={[styles.wLabel, { marginTop: 14 }]}>Account Holder Name *</Text>
      <TextInput
        style={styles.wInput} value={wAccountHolder} onChangeText={setWAccountHolder}
        placeholder="Full name as on bank account" placeholderTextColor="#9CA3AF"
      />

      {/* Bank Name (conditional) */}
      {bankCfg.fields.includes("bank_name") && (
        <>
          <Text style={styles.wLabel}>Bank Name *</Text>
          <TextInput style={styles.wInput} value={wBankName} onChangeText={setWBankName} placeholder="e.g. Standard Bank, FNB, GTBank" placeholderTextColor="#9CA3AF" />
        </>
      )}

      {/* Account Number */}
      <Text style={styles.wLabel}>{bankCfg.accountNumberLabel} *</Text>
      <TextInput
        style={styles.wInput} value={wAccountNumber} onChangeText={setWAccountNumber}
        placeholder={bankCfg.accountNumberPlaceholder} keyboardType="default" placeholderTextColor="#9CA3AF"
      />

      {/* Country-specific fields */}
      {bankCfg.fields.includes("branch_code") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.branch_code ?? "Branch Code"} *</Text>
          <TextInput style={styles.wInput} value={wBranchCode} onChangeText={setWBranchCode} placeholder="e.g. 051001" keyboardType="number-pad" placeholderTextColor="#9CA3AF" />
        </>
      )}
      {bankCfg.fields.includes("sort_code") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.sort_code ?? "Sort Code"} *</Text>
          <TextInput style={styles.wInput} value={wSortCode} onChangeText={setWSortCode} placeholder="xx-xx-xx" placeholderTextColor="#9CA3AF" />
        </>
      )}
      {bankCfg.fields.includes("routing_number") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.routing_number ?? "Routing Number"} *</Text>
          <TextInput style={styles.wInput} value={wRoutingNumber} onChangeText={setWRoutingNumber} placeholder="9-digit ABA routing number" keyboardType="number-pad" placeholderTextColor="#9CA3AF" />
        </>
      )}
      {bankCfg.fields.includes("iban") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.iban ?? "IBAN"}</Text>
          <TextInput style={styles.wInput} value={wIban} onChangeText={setWIban} placeholder="e.g. GB29 NWBK 6016 1331 9268 19" placeholderTextColor="#9CA3AF" autoCapitalize="characters" />
        </>
      )}
      {bankCfg.fields.includes("bic") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.bic ?? "BIC / SWIFT"}</Text>
          <TextInput style={styles.wInput} value={wBic} onChangeText={setWBic} placeholder="e.g. HBUKGB4B" placeholderTextColor="#9CA3AF" autoCapitalize="characters" />
        </>
      )}
      {bankCfg.fields.includes("bank_code") && (
        <>
          <Text style={styles.wLabel}>{bankCfg.extraLabel?.bank_code ?? "Bank Code"}</Text>
          <TextInput style={styles.wInput} value={wBankCode} onChangeText={setWBankCode} placeholder="3-digit bank code" keyboardType="number-pad" placeholderTextColor="#9CA3AF" />
        </>
      )}

      {/* Account Type */}
      <Text style={[styles.wLabel, { marginTop: 4 }]}>Account Type</Text>
      <View style={styles.accountTypeRow}>
        {(["current", "savings", "checking"] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.accountTypeBtn, wAccountType === t && styles.accountTypeBtnActive]}
            onPress={() => setWAccountType(t)}
          >
            <Text style={[styles.accountTypeBtnText, wAccountType === t && styles.accountTypeBtnTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reference */}
      <Text style={[styles.wLabel, { marginTop: 8 }]}>Reference / Note (optional)</Text>
      <TextInput
        style={styles.wInput} value={wReference} onChangeText={setWReference}
        placeholder="e.g. Business withdrawal March 2026" placeholderTextColor="#9CA3AF"
      />

      <TouchableOpacity
        style={[styles.wSubmitBtn, (!wAmount || !wAccountHolder || !wAccountNumber) && { opacity: 0.45 }]}
        onPress={() => setWithdrawStep("confirm")}
        disabled={!wAmount || !wAccountHolder || !wAccountNumber}
      >
        <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
        <Text style={styles.wSubmitBtnText}>Review Withdrawal</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderWithdrawConfirm = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.confirmCard}>
        <Ionicons name="alert-circle" size={36} color="#F59E0B" style={{ alignSelf: "center", marginBottom: 10 }} />
        <Text style={styles.confirmTitle}>Confirm Withdrawal</Text>
        <Text style={styles.confirmSubtitle}>Please review the details carefully before submitting.</Text>
      </View>

      {[
        { label: "Amount", value: `${wCurrency} ${parseFloat(wAmount || "0").toFixed(2)}`, highlight: true },
        { label: "Account Holder", value: wAccountHolder },
        { label: "Country", value: `${bankCfg.flag} ${bankCfg.name}` },
        ...(wBankName ? [{ label: "Bank", value: wBankName }] : []),
        { label: "Account Number", value: wAccountNumber },
        ...(wBranchCode ? [{ label: "Branch Code", value: wBranchCode }] : []),
        ...(wSortCode ? [{ label: "Sort Code", value: wSortCode }] : []),
        ...(wRoutingNumber ? [{ label: "Routing Number", value: wRoutingNumber }] : []),
        ...(wIban ? [{ label: "IBAN", value: wIban }] : []),
        ...(wBic ? [{ label: "BIC/SWIFT", value: wBic }] : []),
        { label: "Account Type", value: wAccountType.charAt(0).toUpperCase() + wAccountType.slice(1) },
        ...(wReference ? [{ label: "Reference", value: wReference }] : []),
      ].map((row, i) => (
        <View key={i} style={styles.confirmRow}>
          <Text style={styles.confirmRowLabel}>{row.label}</Text>
          <Text style={[styles.confirmRowValue, (row as any).highlight && { color: "#10B981", fontWeight: "800", fontSize: 17 }]}>
            {row.value}
          </Text>
        </View>
      ))}

      <View style={styles.confirmNote}>
        <Ionicons name="time-outline" size={14} color="#6B7280" />
        <Text style={styles.confirmNoteText}>Funds arrive within 1–3 business days.</Text>
      </View>

      <TouchableOpacity style={styles.wSubmitBtn} onPress={submitWithdrawal} disabled={wLoading}>
        {wLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
        <Text style={styles.wSubmitBtnText}>{wLoading ? "Submitting…" : "Submit Withdrawal"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.wBackBtn} onPress={() => setWithdrawStep("form")}>
        <Text style={styles.wBackBtnText}>← Go Back & Edit</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderWithdrawSuccess = () => (
    <View style={styles.successWrap}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={64} color="#10B981" />
      </View>
      <Text style={styles.successTitle}>Withdrawal Submitted!</Text>
      <Text style={styles.successSubtitle}>
        Your withdrawal of {wCurrency} {parseFloat(wAmount || "0").toFixed(2)} to {wAccountHolder} has been received.
        Funds arrive within 1–3 business days.
      </Text>
      <View style={styles.successRefBox}>
        <Text style={styles.successRefLabel}>To Account</Text>
        <Text style={styles.successRefValue}>{wAccountNumber}</Text>
        {wBankName && <Text style={styles.successRefMeta}>{wBankName}</Text>}
      </View>
      <TouchableOpacity style={styles.wSubmitBtn} onPress={() => { setShowWithdraw(false); resetWithdraw(); }}>
        <Ionicons name="checkmark" size={18} color="#fff" />
        <Text style={styles.wSubmitBtnText}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.wBackBtn} onPress={() => { resetWithdraw(); }}>
        <Text style={styles.wBackBtnText}>Make Another Withdrawal</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Main Render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowSwitcher(!showSwitcher)}>
          <View style={styles.headerStorefront}>
            <Ionicons name="storefront" size={16} color="#7C3AED" />
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedMerchant.businessName}</Text>
          <Ionicons name={showSwitcher ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.push("/(screens)/become-merchant")}>
          <Ionicons name="add-circle-outline" size={24} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      {showSwitcher && (
        <View style={styles.switcherDropdown}>
          {merchants.map((m) => (
            <View
              key={m.id}
              style={[styles.switcherItem, m.id === selectedMerchantId && styles.switcherItemActive]}
            >
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
                onPress={() => { setSelectedMerchantId(m.id); setShowSwitcher(false); }}
              >
                <Ionicons name="storefront" size={16} color="#7C3AED" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switcherName}>{m.businessName}</Text>
                  <Text style={styles.switcherType}>{m.businessType.replace(/_/g, " ")}</Text>
                </View>
                {m.id === selectedMerchantId && <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switcherDeleteBtn}
                onPress={() => deleteBusiness(m)}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.switcherAddBtn}
            onPress={() => { setShowSwitcher(false); router.push("/(screens)/become-merchant"); }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#7C3AED" />
            <Text style={styles.switcherAddText}>Add Another Business</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {([
          { key: "overview" as TabKey, label: "Overview", icon: "analytics" as const },
          { key: "transactions" as TabKey, label: "Transactions", icon: "receipt" as const },
          { key: "customers" as TabKey, label: "Customers", icon: "people" as const },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? "#7C3AED" : "#9CA3AF"} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "overview" && renderOverview()}
        {activeTab === "transactions" && renderTransactions()}
        {activeTab === "customers" && renderCustomers()}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── QR Modal ── */}
      <Modal visible={showQRDialog} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Merchant QR Code</Text>
              <TouchableOpacity onPress={() => setShowQRDialog(false)}>
                <Ionicons name="close-circle" size={26} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
            <View style={styles.qrCard}>
              <View style={styles.qrBrandRow}>
                <Image source={logoImage} style={styles.qrLogo} />
                <View>
                  <Text style={styles.qrBrandName}>BukkaPay</Text>
                  <Text style={styles.qrBrandTag}>Merchant Payment QR</Text>
                </View>
              </View>
              <View style={styles.qrCodeWrap}>
                <QRCode
                  value={selectedMerchant.qrCode || `bukkapay://merchant/${selectedMerchant.id}`}
                  size={180} color="#001A72" backgroundColor="#FFFFFF" logo={logoImage}
                  logoSize={30} logoBackgroundColor="#FFFFFF"
                />
              </View>
              <Text style={styles.qrMerchantName}>{selectedMerchant.businessName}</Text>
              <View style={styles.qrBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#7C3AED" />
                <Text style={styles.qrBadgeText}>{selectedMerchant.qrCode}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.qrShareBtn} onPress={sharePaymentLink}>
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={styles.qrShareBtnText}>Share QR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Generate Link Modal ── */}
      <Modal visible={showGenerateLink} animationType="slide" transparent onRequestClose={() => setShowGenerateLink(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Platform.OS === "ios" ? 40 : 24 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Generate Payment Link</Text>
              <TouchableOpacity onPress={() => setShowGenerateLink(false)}>
                <Ionicons name="close-circle" size={26} color="#D1D5DB" />
              </TouchableOpacity>
            </View>

            {!generatedLink ? (
              <>
                <Text style={styles.genSubtitle}>Create a shareable link — payments go directly to your merchant wallet.</Text>

                <Text style={styles.genLabel}>Currency</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {CURRENCIES.map(c => (
                      <TouchableOpacity key={c} style={[styles.genChip, genCurrency === c && styles.genChipActive]} onPress={() => setGenCurrency(c)}>
                        <Text style={[styles.genChipText, genCurrency === c && styles.genChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={styles.genLabel}>Amount *</Text>
                <TextInput
                  style={styles.genInput} value={genAmount} onChangeText={setGenAmount}
                  placeholder={`0.00 ${genCurrency}`} keyboardType="decimal-pad" placeholderTextColor="#9CA3AF"
                />

                <Text style={styles.genLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.genInput, { height: 70, textAlignVertical: "top" }]}
                  value={genDesc} onChangeText={setGenDesc}
                  placeholder="What is this payment for?" multiline numberOfLines={3} placeholderTextColor="#9CA3AF"
                />

                <TouchableOpacity
                  style={[styles.genBtn, (!genAmount || genLoading) && { opacity: 0.5 }]}
                  onPress={generateMerchantLink} disabled={!genAmount || genLoading}
                >
                  {genLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="link" size={18} color="#fff" />}
                  <Text style={styles.genBtnText}>Generate Link</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.genSuccess}>
                  <Ionicons name="checkmark-circle" size={52} color="#10B981" />
                  <Text style={styles.genSuccessTitle}>Link Created!</Text>
                  <Text style={styles.genSuccessAmount}>{generatedLink.currency} {parseFloat(generatedLink.amount).toFixed(2)}</Text>
                  {generatedLink.description && <Text style={styles.genSuccessDesc}>{generatedLink.description}</Text>}
                  <View style={styles.genUrlBox}>
                    <Text style={styles.genUrlText} numberOfLines={2}>{generatedLink.url}</Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.genBtn, { marginBottom: 10 }]} onPress={async () => {
                  const text = `Pay ${generatedLink.currency} ${parseFloat(generatedLink.amount).toFixed(2)} to ${selectedMerchant.businessName}:\n${generatedLink.url}`;
                  try { await Share.share({ message: text }); } catch {}
                }}>
                  <Ionicons name="share-social" size={18} color="#fff" />
                  <Text style={styles.genBtnText}>Share Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.genOutlineBtn} onPress={async () => {
                  await Clipboard.setStringAsync(generatedLink.url);
                  Alert.alert("Copied!", "Payment link copied.");
                }}>
                  <Ionicons name="copy" size={16} color="#7C3AED" />
                  <Text style={styles.genOutlineBtnText}> Copy Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.genOutlineBtn, { marginTop: 8, borderColor: "#E5E7EB" }]} onPress={() => setGeneratedLink(null)}>
                  <Ionicons name="add" size={16} color="#6B7280" />
                  <Text style={[styles.genOutlineBtnText, { color: "#6B7280" }]}> Create Another</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Withdraw Modal ── */}
      <Modal visible={showWithdraw} animationType="slide" transparent onRequestClose={() => { if (withdrawStep !== "success") setShowWithdraw(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, styles.withdrawSheet]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {withdrawStep === "form" ? "Withdraw Funds" : withdrawStep === "confirm" ? "Confirm Details" : "Withdrawal Sent"}
              </Text>
              {withdrawStep !== "success" && (
                <TouchableOpacity onPress={() => setShowWithdraw(false)}>
                  <Ionicons name="close-circle" size={26} color="#D1D5DB" />
                </TouchableOpacity>
              )}
            </View>
            {withdrawStep === "form" && renderWithdrawForm()}
            {withdrawStep === "confirm" && renderWithdrawConfirm()}
            {withdrawStep === "success" && renderWithdrawSuccess()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FC" },

  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, backgroundColor: "#F7F8FC" },
  loaderText: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  ctaBtn: { backgroundColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, marginTop: 16 },
  ctaBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // ── Header ──
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F0F0F5" },
  headerBack: { width: 40, alignItems: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  headerStorefront: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A2E", maxWidth: SCREEN_WIDTH * 0.45 },

  // ── Switcher ──
  switcherDropdown: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F0F0F5", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  switcherItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F7F8FC" },
  switcherItemActive: { backgroundColor: "#FAF5FF" },
  switcherName: { fontSize: 14, fontWeight: "700", color: "#1A1A2E" },
  switcherType: { fontSize: 12, color: "#9CA3AF", marginTop: 1, textTransform: "capitalize" },
  switcherDeleteBtn: { padding: 8, marginLeft: 4 },
  switcherAddBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F0F0F5" },
  switcherAddText: { fontSize: 14, fontWeight: "700", color: "#7C3AED" },

  // ── Tab Bar ──
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F0F0F5" },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#7C3AED" },
  tabText: { fontSize: 12, fontWeight: "600", color: "#9CA3AF" },
  tabTextActive: { color: "#7C3AED" },

  // ── Body ──
  body: { flex: 1 },
  bodyContent: { padding: 16 },

  // ── Balance Card ──
  balanceCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#1A1A2E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceCardInner: { padding: 22 },
  balanceTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  balanceCardLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 0.5, marginBottom: 4 },
  balanceCardValue: { fontSize: 34, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 },
  balanceCardSub: { fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDotLive: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  growthChip: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 18, marginTop: 2 },
  growthChipText: { fontSize: 12, fontWeight: "600" },

  // ── Quick Actions Grid ──
  quickActionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  qaBtn: { width: (SCREEN_WIDTH - 32 - 22 * 2 - 10 * 2) / 3, alignItems: "center", gap: 6 },
  qaIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  qaLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)", textAlign: "center" },

  // ── Health Score ──
  healthCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 14, borderWidth: 1, borderColor: "#F0F0F5" },
  healthLeft: { flex: 1 },
  healthTitle: { fontSize: 14, fontWeight: "800", color: "#1A1A2E", marginBottom: 2 },
  healthSub: { fontSize: 11, color: "#9CA3AF", marginBottom: 10, lineHeight: 16 },
  healthBar: { height: 8, backgroundColor: "#F3F4F6", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  healthBarFill: { height: "100%", borderRadius: 4 },
  healthLabel: { fontSize: 13, fontWeight: "700" },
  healthScoreCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  healthScoreNum: { fontSize: 20, fontWeight: "900", lineHeight: 22 },
  healthScoreMax: { fontSize: 9, color: "#9CA3AF", lineHeight: 12 },

  // ── Stats ──
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  statCard: { width: (SCREEN_WIDTH - 42) / 2, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#F0F0F5" },
  statIconBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statLabel: { fontSize: 11, color: "#6B7280", fontWeight: "600", marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
  statSub: { fontSize: 11, color: "#9CA3AF" },

  // ── Metrics Row ──
  metricsRow: { backgroundColor: "#FFFFFF", borderRadius: 14, flexDirection: "row", padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#F0F0F5" },
  metricItem: { flex: 1, alignItems: "center", gap: 4 },
  metricDivider: { width: 1, backgroundColor: "#F0F0F5", marginVertical: 4 },
  metricValue: { fontSize: 16, fontWeight: "800", color: "#1A1A2E" },
  metricLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", textAlign: "center" },

  // ── Section ──
  section: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1.2, marginBottom: 10 },
  sectionAction: { fontSize: 12, fontWeight: "700", color: "#7C3AED" },

  // ── Chart ──
  chartCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 130, borderWidth: 1, borderColor: "#F0F0F5" },
  chartBar: { flex: 1, alignItems: "center", gap: 4 },
  chartBarAmt: { fontSize: 8, color: "#9CA3AF", fontWeight: "600" },
  chartBarTrack: { width: 18, height: 76, backgroundColor: "#F3F4F6", borderRadius: 6, overflow: "hidden", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 6, minHeight: 2 },
  chartBarDay: { fontSize: 10, color: "#9CA3AF", fontWeight: "600" },

  // ── Top Links ──
  linkRow: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, borderWidth: 1, borderColor: "#F0F0F5" },
  linkRank: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  linkRankText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  linkDesc: { fontSize: 14, fontWeight: "700", color: "#1A1A2E" },
  linkMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  linkBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "#F3F4F6" },
  linkBadgeText: { fontSize: 11, fontWeight: "700" },

  // ── Breakdown ──
  breakdownCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#F0F0F5", gap: 12 },
  breakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  breakdownLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  breakdownRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  breakdownCount: { fontSize: 15, fontWeight: "800" },
  breakdownPct: { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  breakdownBarTrack: { height: 6, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden", marginTop: 4 },
  breakdownBarFill: { height: "100%", borderRadius: 3 },

  // ── Limit ──
  limitCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#F0F0F5" },
  limitRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  limitLabel: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  limitVal: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  limitBarTrack: { height: 8, backgroundColor: "#F3F4F6", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  limitBarFill: { height: "100%", borderRadius: 4 },
  limitRemaining: { fontSize: 12, color: "#9CA3AF" },

  // ── Info Card ──
  infoCard: { backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#F0F0F5" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F7F8FC" },
  infoLabel: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  infoValue: { fontSize: 13, fontWeight: "700", color: "#1A1A2E", maxWidth: "55%", textAlign: "right" },
  infoMono: { fontSize: 11, fontWeight: "600", color: "#374151", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", maxWidth: "55%", textAlign: "right" },

  // ── Landlord Btn ──
  landlordBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EDE9FE", borderRadius: 12, paddingVertical: 14, marginBottom: 16 },
  landlordBtnText: { fontSize: 14, fontWeight: "700", color: "#7C3AED" },

  // ── Transactions ──
  txSectionHeader: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  txItem: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, borderWidth: 1, borderColor: "#F0F0F5" },
  txIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txName: { fontSize: 14, fontWeight: "700", color: "#1A1A2E" },
  txDate: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  txRef: { fontSize: 11, color: "#C4B5FD", marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "800" },
  txBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  txBadgeText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },

  // ── Customers ──
  customerSummaryRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  customerSummaryCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#F0F0F5" },
  customerSummaryNum: { fontSize: 26, fontWeight: "900", color: "#1A1A2E" },
  customerSummaryLbl: { fontSize: 12, color: "#6B7280", fontWeight: "600", textAlign: "center" },
  customerRow: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8, borderWidth: 1, borderColor: "#F0F0F5" },
  customerRankBadge: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  customerRankText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  customerAvatarText: { fontSize: 16, fontWeight: "800" },
  customerName: { fontSize: 14, fontWeight: "700", color: "#1A1A2E" },
  customerMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  customerTotal: { fontSize: 15, fontWeight: "800", color: "#1A1A2E" },

  // ── Empty State ──
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 14, color: "#9CA3AF", textAlign: "center", lineHeight: 20, maxWidth: 280 },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" },
  withdrawSheet: { maxHeight: "92%", paddingBottom: Platform.OS === "ios" ? 40 : 24 },
  modalHandle: { width: 36, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#1A1A2E" },

  // ── QR ──
  qrCard: { backgroundColor: "#F9FAFB", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  qrBrandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  qrLogo: { width: 36, height: 36, borderRadius: 8 },
  qrBrandName: { fontSize: 16, fontWeight: "800", color: "#1A1A2E" },
  qrBrandTag: { fontSize: 12, color: "#6B7280" },
  qrCodeWrap: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  qrMerchantName: { fontSize: 16, fontWeight: "800", color: "#1A1A2E", marginBottom: 8 },
  qrBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  qrBadgeText: { fontSize: 11, fontWeight: "700", color: "#7C3AED" },
  qrShareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#7C3AED", borderRadius: 14, height: 50 },
  qrShareBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // ── Generate Link ──
  genSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 18, lineHeight: 20 },
  genLabel: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  genInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#1A1A2E", backgroundColor: "#F9FAFB", marginBottom: 14, height: 48 },
  genChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  genChipActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  genChipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  genChipTextActive: { color: "#FFFFFF" },
  genBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#7C3AED", borderRadius: 12, height: 50, marginTop: 4 },
  genBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  genOutlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#7C3AED" },
  genOutlineBtnText: { fontSize: 14, fontWeight: "700", color: "#7C3AED" },
  genSuccess: { alignItems: "center", paddingVertical: 10, marginBottom: 16, gap: 6 },
  genSuccessTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  genSuccessAmount: { fontSize: 24, fontWeight: "900", color: "#10B981" },
  genSuccessDesc: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  genUrlBox: { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, maxWidth: "100%" },
  genUrlText: { fontSize: 12, color: "#4B5563", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  // ── Withdraw ──
  withdrawSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 18, lineHeight: 20 },
  wLabel: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  wInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#1A1A2E", backgroundColor: "#F9FAFB", marginBottom: 14, height: 48 },
  wAmountRow: { marginBottom: 10 },
  wBalanceHint: { fontSize: 12, color: "#10B981", fontWeight: "600", marginBottom: 14, marginTop: -8 },
  wCountryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: "#F9FAFB", marginBottom: 6 },
  wCountryBtnText: { fontSize: 15, color: "#1A1A2E", fontWeight: "600" },
  countryPickerList: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 14, overflow: "hidden", maxHeight: 220 },
  countryPickerItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F7F8FC" },
  countryPickerItemActive: { backgroundColor: "#FAF5FF" },
  countryPickerFlag: { fontSize: 22 },
  countryPickerName: { flex: 1, fontSize: 14, color: "#374151", fontWeight: "500" },
  wChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  wChipActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  wChipText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  wChipTextActive: { color: "#FFFFFF" },
  accountTypeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  accountTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#F9FAFB" },
  accountTypeBtnActive: { backgroundColor: "#EDE9FE", borderColor: "#7C3AED" },
  accountTypeBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  accountTypeBtnTextActive: { color: "#7C3AED" },
  wSubmitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", borderRadius: 12, height: 52, marginTop: 8 },
  wSubmitBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  wBackBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  wBackBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },

  // ── Withdraw Confirm ──
  confirmCard: { backgroundColor: "#FFF7ED", borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "#FED7AA" },
  confirmTitle: { fontSize: 17, fontWeight: "800", color: "#92400E", textAlign: "center", marginBottom: 4 },
  confirmSubtitle: { fontSize: 13, color: "#B45309", textAlign: "center" },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  confirmRowLabel: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  confirmRowValue: { fontSize: 14, fontWeight: "700", color: "#1A1A2E", maxWidth: "55%", textAlign: "right" },
  confirmNote: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 14 },
  confirmNoteText: { fontSize: 12, color: "#6B7280" },

  // ── Withdraw Success ──
  successWrap: { alignItems: "center", paddingVertical: 20, gap: 10 },
  successIconWrap: { width: 90, height: 90, borderRadius: 45, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  successTitle: { fontSize: 22, fontWeight: "900", color: "#1A1A2E" },
  successSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, maxWidth: 300 },
  successRefBox: { backgroundColor: "#F3F4F6", borderRadius: 12, padding: 14, alignItems: "center", width: "100%", gap: 4, marginVertical: 8 },
  successRefLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  successRefValue: { fontSize: 16, fontWeight: "800", color: "#1A1A2E" },
  successRefMeta: { fontSize: 13, color: "#6B7280" },
});
