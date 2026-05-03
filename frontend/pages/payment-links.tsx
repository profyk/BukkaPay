import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Share, Alert,
  TextInput, Clipboard, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";

const PRIMARY = "#7C3AED";
const PRIMARY_DARK = "#5B21B6";
const GREEN = "#10B981";
const AMBER = "#F59E0B";
const BLUE = "#3B82F6";
const RED = "#EF4444";

interface PaymentLink {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  status: string;
  amountPaid: string;
  remainingBalance: string;
  allowPartialPayment: boolean;
  type: string;
  region: string;
  destination: string;
  createdAt: string;
  paymentUrl?: string;
  direction?: "sent" | "received";
}

const STATUS_COLORS: Record<string, string> = {
  pending: AMBER,
  partial: BLUE,
  paid: GREEN,
  cancelled: RED,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  partial: "Partial",
  paid: "Paid",
  cancelled: "Cancelled",
};

export default function PaymentLinks() {
  const router = useRouter();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (e) {
      console.error("Failed to fetch payment links", e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const onRefresh = () => { setRefreshing(true); fetchLinks(); };

  const shareLink = async (link: PaymentLink) => {
    const url = `https://app.bukkapay.com/pay/${link.id}`;
    try {
      await Share.share({ message: `Pay me ${link.currency} ${parseFloat(link.amount).toFixed(2)} via BukkaPay: ${url}` });
    } catch {}
  };

  const copyLink = (link: PaymentLink) => {
    const url = `https://app.bukkapay.com/pay/${link.id}`;
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(url).catch(() => {});
    } else {
      Clipboard.setString(url);
    }
    Alert.alert("Copied!", "Payment link copied to clipboard.");
  };

  const confirmDelete = (link: PaymentLink) => {
    Alert.alert(
      "Delete Payment Link",
      `Are you sure you want to delete "${link.description || "this payment link"}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteLink(link.id) },
      ]
    );
  };

  const deleteLink = async (id: string) => {
    setDeletingId(id);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links/${id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setLinks(prev => prev.filter(l => l.id !== id));
      } else {
        const d = await res.json().catch(() => ({}));
        Alert.alert("Error", d.error || "Could not delete this link. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setDeletingId(null);
    }
  };

  const sentLinks = links.filter(l => l.direction !== "received");
  const receivedLinks = links.filter(l => l.direction === "received");

  const baseFiltered = filter === "all"
    ? links
    : filter === "received"
    ? receivedLinks
    : sentLinks.filter(l => l.status === filter);

  const filteredLinks = search.trim()
    ? baseFiltered.filter(l =>
        (l.description || "").toLowerCase().includes(search.toLowerCase()) ||
        l.currency.toLowerCase().includes(search.toLowerCase())
      )
    : baseFiltered;

  // Analytics
  const totalRevenue = sentLinks.filter(l => l.status === "paid").reduce((s, l) => s + parseFloat(l.amountPaid), 0);
  const totalPending = sentLinks.filter(l => l.status === "pending" || l.status === "partial").reduce((s, l) => s + parseFloat(l.remainingBalance), 0);
  const totalPartial = sentLinks.filter(l => l.status === "partial").reduce((s, l) => s + parseFloat(l.amountPaid), 0);
  const activeLinks = sentLinks.filter(l => l.status === "pending" || l.status === "partial").length;
  const conversionRate = sentLinks.length > 0
    ? Math.round((sentLinks.filter(l => l.status === "paid" || l.status === "partial").length / sentLinks.length) * 100)
    : 0;
  const mainCurrency = sentLinks[0]?.currency || "ZAR";

  const fmt = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(2);
  };

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Payment Links</Text>
        <View style={s.topBarActions}>
          <TouchableOpacity
            style={s.inboxBtn}
            onPress={() => router.push("/(screens)/received-links" as any)}
          >
            <Ionicons name="inbox" size={17} color={PRIMARY} />
            {receivedLinks.length > 0 && (
              <View style={s.inboxBadge}>
                <Text style={s.inboxBadgeText}>{receivedLinks.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.newLinkBtn}
            onPress={() => router.push("/(screens)/create-payment-link" as any)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.newLinkBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
      >
        {/* ── Hero Analytics Banner ── */}
        <View style={s.heroBanner}>
          <View style={s.heroTop}>
            <View style={s.heroTitleRow}>
              <Ionicons name="bar-chart-outline" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroLabel}>Revenue Overview</Text>
            </View>
            <View style={s.conversionBadge}>
              <Ionicons name="trending-up" size={12} color="#10B981" />
              <Text style={s.conversionBadgeText}>{conversionRate}% conversion</Text>
            </View>
          </View>
          <Text style={s.heroAmount}>{mainCurrency} {fmt(totalRevenue + totalPartial)}</Text>
          <Text style={s.heroSub}>Total collected across {sentLinks.length} link{sentLinks.length !== 1 ? "s" : ""}</Text>

          <View style={s.heroStatsRow}>
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{mainCurrency} {fmt(totalRevenue)}</Text>
              <Text style={s.heroStatLabel}>Fully Paid</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={[s.heroStatValue, { color: "#FDE68A" }]}>{mainCurrency} {fmt(totalPending)}</Text>
              <Text style={s.heroStatLabel}>Outstanding</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatValue}>{activeLinks}</Text>
              <Text style={s.heroStatLabel}>Active</Text>
            </View>
          </View>
        </View>

        {/* ── Metric Cards Row ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.metricsScroll} contentContainerStyle={s.metricsRow}>
          <MetricCard icon="checkmark-circle" label="Paid Links" value={sentLinks.filter(l => l.status === "paid").length.toString()} color={GREEN} bg="#ECFDF5" />
          <MetricCard icon="time-outline" label="Pending" value={sentLinks.filter(l => l.status === "pending").length.toString()} color={AMBER} bg="#FFFBEB" />
          <MetricCard icon="reload-outline" label="Partial" value={sentLinks.filter(l => l.status === "partial").length.toString()} color={BLUE} bg="#EFF6FF" />
          <MetricCard icon="arrow-down-circle-outline" label="Received" value={receivedLinks.length.toString()} color="#8B5CF6" bg="#F5F3FF" />
        </ScrollView>

        {/* ── Search Bar ── */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by description or currency…"
            placeholderTextColor="#9CA3AF"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter Chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContainer}>
          {[
            { key: "all", label: `All (${links.length})` },
            { key: "received", label: `Received (${receivedLinks.length})` },
            { key: "pending", label: `Pending (${sentLinks.filter(l => l.status === "pending").length})` },
            { key: "partial", label: `Partial (${sentLinks.filter(l => l.status === "partial").length})` },
            { key: "paid", label: `Paid (${sentLinks.filter(l => l.status === "paid").length})` },
            { key: "cancelled", label: `Cancelled (${sentLinks.filter(l => l.status === "cancelled").length})` },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterChip, filter === f.key && s.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Empty State ── */}
        {filteredLinks.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="link-outline" size={36} color="#C4B5FD" />
            </View>
            <Text style={s.emptyTitle}>
              {search ? "No results found" : filter === "all" ? "No payment links yet" : `No ${filter === "received" ? "received" : STATUS_LABELS[filter]?.toLowerCase()} links`}
            </Text>
            <Text style={s.emptySubtitle}>
              {search ? "Try a different search term" : "Create a payment link to start collecting payments from anyone, anywhere."}
            </Text>
            {!search && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(screens)/create-payment-link" as any)}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={s.emptyBtnText}>Create Payment Link</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <View style={s.listHeader}>
              <Text style={s.listCount}>{filteredLinks.length} link{filteredLinks.length !== 1 ? "s" : ""}</Text>
              <Text style={s.listSort}>Newest first</Text>
            </View>
            <View style={s.linksList}>
              {filteredLinks.map(link => (
                <PaymentLinkCard
                  key={link.id}
                  link={link}
                  isDeleting={deletingId === link.id}
                  onShare={() => shareLink(link)}
                  onCopy={() => copyLink(link)}
                  onDelete={() => confirmDelete(link)}
                  onPayNow={() => router.push(`/pay/${link.id}` as any)}
                  onViewDetails={() => router.push(`/(screens)/payment-link-detail?id=${link.id}` as any)}
                />
              ))}
            </View>
          </>
        )}

        {/* ── CTA footer ── */}
        {links.length > 0 && (
          <TouchableOpacity style={s.fabFooter} onPress={() => router.push("/(screens)/create-payment-link" as any)}>
            <Ionicons name="add-circle" size={20} color={PRIMARY} />
            <Text style={s.fabFooterText}>Create New Payment Link</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function MetricCard({ icon, label, value, color, bg }: {
  icon: any; label: string; value: string; color: string; bg: string;
}) {
  return (
    <View style={[s.metricCard, { backgroundColor: bg }]}>
      <View style={[s.metricIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function PaymentLinkCard({
  link, isDeleting, onShare, onCopy, onDelete, onPayNow, onViewDetails,
}: {
  link: PaymentLink;
  isDeleting: boolean;
  onShare: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onPayNow: () => void;
  onViewDetails: () => void;
}) {
  const progress = parseFloat(link.amount) > 0
    ? parseFloat(link.amountPaid) / parseFloat(link.amount) : 0;
  const isReceived = link.direction === "received";
  const isPaid = link.status === "paid";
  const statusColor = STATUS_COLORS[link.status] || "#6B7280";

  return (
    <TouchableOpacity
      style={[s.card, isDeleting && { opacity: 0.5 }]}
      onPress={onViewDetails}
      activeOpacity={0.85}
    >
      {/* Card Header */}
      <View style={s.cardTopRow}>
        <View style={[s.cardIcon, { backgroundColor: isReceived ? "#EFF6FF" : statusColor + "18" }]}>
          <Ionicons
            name={isReceived ? "arrow-down-circle" : isPaid ? "checkmark-circle" : "link"}
            size={22}
            color={isReceived ? BLUE : statusColor}
          />
        </View>

        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <View style={s.descRow}>
            <Text style={s.cardDescription} numberOfLines={1}>
              {link.description || "Payment Request"}
            </Text>
            {isReceived && <View style={s.dirBadge}><Text style={s.dirBadgeText}>IN</Text></View>}
          </View>
          <Text style={s.cardDate}>{new Date(link.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Text>
        </View>

        <View style={s.cardRightCol}>
          <View style={[s.statusPill, { backgroundColor: statusColor + "15" }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusPillText, { color: statusColor }]}>{STATUS_LABELS[link.status]}</Text>
          </View>
          <Text style={s.cardAmount}>{link.currency} {parseFloat(link.amount).toFixed(2)}</Text>
        </View>
      </View>

      {/* Progress bar for partial */}
      {parseFloat(link.amountPaid) > 0 && !isPaid && (
        <View style={s.progressWrap}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: statusColor }]} />
          </View>
          <Text style={s.progressLabel}>{Math.round(progress * 100)}% collected</Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={s.actionsBar}>
        {isReceived ? (
          <>
            {!isPaid && (
              <ActionBtn icon="wallet" label="Pay Now" color="#fff" bg={GREEN} onPress={onPayNow} />
            )}
            <ActionBtn icon="share-social-outline" label="Share" color={PRIMARY} onPress={onShare} />
            <ActionBtn icon="copy-outline" label="Copy" color="#6B7280" onPress={onCopy} />
          </>
        ) : (
          <>
            <ActionBtn icon="share-social-outline" label="Share" color={PRIMARY} onPress={onShare} />
            <ActionBtn icon="copy-outline" label="Copy" color="#6B7280" onPress={onCopy} />
            <ActionBtn
              icon="trash-outline" label="Delete" color={RED}
              onPress={onDelete}
              disabled={isDeleting}
            />
          </>
        )}
        <TouchableOpacity style={s.expandToggle} onPress={onViewDetails}>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ActionBtn({ icon, label, color, bg, onPress, disabled }: {
  icon: any; label: string; color: string; bg?: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, bg ? { backgroundColor: bg, borderColor: bg } : {}, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={15} color={bg ? "#fff" : color} />
      <Text style={[s.actionBtnText, { color: bg ? "#fff" : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AmountPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.amountPill}>
      <Text style={s.amountPillLabel}>{label}</Text>
      <Text style={[s.amountPillValue, { color }]}>{value}</Text>
    </View>
  );
}

function MetaTag({ label }: { label: string }) {
  return (
    <View style={s.metaTag}>
      <Text style={s.metaTagText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F3FF" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F3FF" },

  // Top Bar
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#EDE9FE",
  },
  backBtn: { padding: 6 },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: "#1A1A2E" },
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  inboxBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center",
  },
  inboxBadge: {
    position: "absolute", top: -3, right: -3,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  inboxBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  newLinkBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  newLinkBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Hero Banner
  heroBanner: {
    margin: 16, borderRadius: 20, padding: 20,
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.75)" },
  conversionBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.2)", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  conversionBadgeText: { fontSize: 11, fontWeight: "700", color: "#6EE7B7" },
  heroAmount: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2, marginBottom: 14 },
  heroStatsRow: { flexDirection: "row", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingTop: 14 },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  heroStatValue: { fontSize: 15, fontWeight: "800", color: "#fff" },
  heroStatLabel: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },

  // Metrics Row
  metricsScroll: { marginBottom: 4 },
  metricsRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 4 },
  metricCard: { width: 90, borderRadius: 14, padding: 12, alignItems: "center" },
  metricIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: "900" },
  metricLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", marginTop: 2, textAlign: "center" },

  // Search
  searchWrap: {
    flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 8,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: "#EDE9FE",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#1A1A2E" },

  // Filter chips
  filterScroll: { marginBottom: 8, height: 44 },
  filterContainer: { paddingHorizontal: 16, gap: 8, alignItems: 'center', height: 44 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB" },
  filterChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterChipText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  filterChipTextActive: { color: "#fff" },

  // List header
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  listCount: { fontSize: 13, fontWeight: "700", color: "#6B7280" },
  listSort: { fontSize: 12, color: "#9CA3AF" },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A2E", textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 6, lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: PRIMARY, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14 },
  emptyBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  // Links list
  linksList: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },

  // Card
  card: {
    backgroundColor: "#fff", borderRadius: 18, padding: 14,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center" },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  descRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardDescription: { fontSize: 14, fontWeight: "700", color: "#1A1A2E", flexShrink: 1 },
  dirBadge: { backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  dirBadgeText: { fontSize: 9, fontWeight: "800", color: BLUE },
  cardDate: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  cardRightCol: { alignItems: "flex-end", gap: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  cardAmount: { fontSize: 13, fontWeight: "800", color: "#1A1A2E" },

  // Progress
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 2 },
  progressTrack: { flex: 1, height: 5, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  progressLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", minWidth: 60, textAlign: "right" },

  // Expanded
  expandedBlock: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: "#F3F4F6" },
  expandedRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  amountPill: { alignItems: "center", flex: 1 },
  amountPillLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "600", marginBottom: 2 },
  amountPillValue: { fontSize: 13, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaTag: { backgroundColor: "#F4F3FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metaTagText: { fontSize: 10, fontWeight: "600", color: "#7C3AED", textTransform: "capitalize" },

  // Actions bar
  actionsBar: {
    flexDirection: "row", gap: 7, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderColor: "#F3F4F6",
    alignItems: "center",
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB",
  },
  actionBtnText: { fontSize: 11, fontWeight: "700" },
  expandToggle: { padding: 6, borderRadius: 8, borderWidth: 1.5, borderColor: "#E5E7EB" },

  // CTA footer
  fabFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, margin: 16, marginTop: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 2, borderStyle: "dashed", borderColor: PRIMARY + "60",
    backgroundColor: "#F5F3FF",
  },
  fabFooterText: { color: PRIMARY, fontWeight: "700", fontSize: 14 },
});
