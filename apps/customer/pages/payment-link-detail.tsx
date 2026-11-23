import { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Share, Alert, Platform, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { canDelete, confirmAction, removeLink } from "../lib/paymentLinks";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const AMBER = "#F59E0B";
const BLUE = "#3B82F6";
const RED = "#EF4444";

const STATUS_COLORS: Record<string, string> = {
  pending: AMBER,
  partial: BLUE,
  paid: GREEN,
  cancelled: RED,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Payment",
  partial: "Partially Paid",
  paid: "Fully Paid",
  cancelled: "Cancelled",
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function fmtTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface LinkDetail {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  status: string;
  amountPaid: string;
  remainingBalance: string;
  allowPartialPayment: boolean;
  minimumPayment?: string;
  type: string;
  destination: string;
  createdAt: string;
  updatedAt?: string;
  paymentUrl?: string;
  senderName?: string;
  businessName?: string;
  direction?: "sent" | "received";
  invoice?: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    type?: string;
    dueDate?: string;
    notes?: string;
    items?: { name: string; quantity: number; unitPrice: number }[];
  };
  payments?: Payment[];
}

interface Payment {
  id: string;
  amount: string;
  payerName?: string;
  payerEmail?: string;
  method?: string;
  status: string;
  createdAt: string;
  reference?: string;
}

export default function PaymentLinkDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const payUrl = `https://app.bukkapay.com/pay/${id}`;

  const fetchDetail = useCallback(async (): Promise<LinkDetail> => {
    const headers = await getAuthHeader();
    const [detailRes, paymentsRes] = await Promise.all([
      fetch(`${API_BASE}/api/payment-links/${id}`, { headers }),
      fetch(`${API_BASE}/api/payment-links/${id}/payments`, { headers }),
    ]);
    const detail = await detailRes.json();
    const payments = paymentsRes.ok ? await paymentsRes.json() : [];
    return { ...detail, payments };
  }, [id]);

  const { data: link, isLoading, refetch, isRefetching } = useQuery<LinkDetail>({
    queryKey: ["payment-link-detail", id],
    queryFn: fetchDetail,
    enabled: !!id,
  });

  // Unpaid links are deleted; links that already took money are cancelled
  // (payments and history kept). Works on web, where Alert.alert is a no-op.
  const deleteLink = () => {
    if (!link) return;
    const del = canDelete(link as any);
    confirmAction(
      del ? "Delete this link?" : "Cancel this link?",
      del ? "Nobody has paid it yet, so it will be removed." : "It has already received money. Cancelling stops new payments; the money and history are kept.",
      del ? "Delete" : "Cancel link",
      async () => {
        setDeleting(true);
        try {
          await removeLink(link as any);
          qc.invalidateQueries({ queryKey: ["payment-links"] });
          if (del) router.back(); else refetch();
        } catch (e: any) {
          if (Platform.OS === "web") window.alert(e.message); else Alert.alert("Couldn't update the link", e.message);
        } finally { setDeleting(false); }
      },
    );
  };

  const share = async () => {
    const desc = link?.description ? ` for "${link.description}"` : "";
    try {
      await Share.share({
        message: `Pay ${link?.currency} ${parseFloat(link?.amount || "0").toFixed(2)}${desc} via BukkaPay:\n${payUrl}`,
      });
    } catch {}
  };

  const copy = async () => {
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(payUrl).catch(() => {});
    } else {
      await Clipboard.setStringAsync(payUrl);
    }
    Alert.alert("Copied!", "Payment link copied to clipboard.");
  };

  if (isLoading) {
    return (
      <View style={[s.centered, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!link) {
    return (
      <View style={[s.centered, { backgroundColor: colors.surface }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text style={[s.notFound, { color: colors.text }]}>Payment link not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backFallbackBtn}>
          <Text style={s.backFallbackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[link.status] || "#6B7280";
  const progress = parseFloat(link.amount) > 0
    ? Math.min((parseFloat(link.amountPaid) / parseFloat(link.amount)) * 100, 100) : 0;
  const isOwner = link.direction !== "received";
  const payments: Payment[] = link.payments || [];

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {link.description || "Payment Link"}
        </Text>
        {isOwner && (
          <TouchableOpacity onPress={share} style={s.headerShareBtn}>
            <Ionicons name="share-social-outline" size={22} color={PRIMARY} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY} />}
      >
        {/* Hero Status Card */}
        <View style={[s.heroCard, { backgroundColor: statusColor }]}>
          <View style={s.heroTop}>
            <Ionicons
              name={link.status === "paid" ? "checkmark-circle" : link.status === "partial" ? "reload-circle" : link.status === "cancelled" ? "close-circle" : "time"}
              size={28} color="rgba(255,255,255,0.9)"
            />
            <Text style={s.heroStatus}>{STATUS_LABELS[link.status] || link.status}</Text>
          </View>
          <Text style={s.heroAmount}>
            {link.currency} {parseFloat(link.amount).toFixed(2)}
          </Text>
          {link.description ? (
            <Text style={s.heroDesc}>{link.description}</Text>
          ) : null}

          {/* Progress */}
          {parseFloat(link.amountPaid) > 0 && (
            <View style={s.heroProgress}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progress}%` as any }]} />
              </View>
              <Text style={s.progressLabel}>{Math.round(progress)}% collected</Text>
            </View>
          )}

          {/* Amount pills */}
          <View style={s.amountRow}>
            <View style={s.amountPill}>
              <Text style={s.amountPillLabel}>Collected</Text>
              <Text style={s.amountPillValue}>{link.currency} {parseFloat(link.amountPaid).toFixed(2)}</Text>
            </View>
            <View style={s.amountPillDivider} />
            <View style={s.amountPill}>
              <Text style={s.amountPillLabel}>Remaining</Text>
              <Text style={s.amountPillValue}>{link.currency} {parseFloat(link.remainingBalance).toFixed(2)}</Text>
            </View>
            <View style={s.amountPillDivider} />
            <View style={s.amountPill}>
              <Text style={s.amountPillLabel}>Payments</Text>
              <Text style={s.amountPillValue}>{payments.length}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={[s.actionsCard, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: PRIMARY }]} onPress={share}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={s.actionBtnTextWhite}>Re-share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnOutline, { borderColor: colors.border }]} onPress={copy}>
            <Ionicons name="copy-outline" size={18} color={colors.text} />
            <Text style={[s.actionBtnTextOutline, { color: colors.text }]}>Copy Link</Text>
          </TouchableOpacity>
          {isOwner && (link?.status === "pending" || link?.status === "partial") && (
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnDanger]}
              onPress={deleteLink}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color={RED} />
                : <Ionicons name="trash-outline" size={18} color={RED} />
              }
              <Text style={s.actionBtnTextDanger}>{link && !canDelete(link as any) ? "Cancel link" : "Delete"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Link URL */}
        <View style={[s.section, { backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>PAYMENT LINK</Text>
          <View style={[s.urlRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.urlText, { color: PRIMARY }]} numberOfLines={1}>{payUrl}</Text>
            <TouchableOpacity onPress={copy} style={s.urlCopyBtn}>
              <Ionicons name="copy" size={16} color={PRIMARY} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dates & Tracking */}
        <View style={[s.section, { backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>DATES & TRACKING</Text>
          <InfoRow label="Created" value={`${fmt(link.createdAt)} at ${fmtTime(link.createdAt)}`} icon="calendar-outline" colors={colors} />
          <InfoRow label="Created" value={timeAgo(link.createdAt)} icon="time-outline" colors={colors} />
          <InfoRow label="Link Type" value={link.type === "personal" ? "Personal" : "Business"} icon="person-circle-outline" colors={colors} />
          <InfoRow label="Payout To" value={link.destination === "wallet" ? "BukkaPay Wallet" : "Bank Account"} icon="wallet-outline" colors={colors} />
          {link.allowPartialPayment && (
            <InfoRow
              label="Min. Payment"
              value={link.minimumPayment ? `${link.currency} ${parseFloat(link.minimumPayment).toFixed(2)}` : "Any amount"}
              icon="cash-outline"
              colors={colors}
            />
          )}
          <InfoRow label="Link ID" value={link.id.slice(0, 8).toUpperCase()} icon="barcode-outline" colors={colors} />
        </View>

        {/* Payment History */}
        <View style={[s.section, { backgroundColor: colors.card }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
            PAYMENT HISTORY ({payments.length})
          </Text>
          {payments.length === 0 ? (
            <View style={s.emptyPayments}>
              <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
              <Text style={[s.emptyPaymentsText, { color: colors.textSecondary }]}>No payments yet</Text>
              <Text style={s.emptyPaymentsSub}>Payments will appear here as they come in</Text>
            </View>
          ) : (
            payments.map((payment, i) => (
              <View key={payment.id} style={[s.paymentItem, i < payments.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider ?? "#F3F4F6" }]}>
                <View style={[s.paymentIcon, { backgroundColor: payment.status === "completed" ? "#ECFDF5" : "#FEF3C7" }]}>
                  <Ionicons
                    name={payment.status === "completed" ? "checkmark-circle" : "time"}
                    size={20}
                    color={payment.status === "completed" ? GREEN : AMBER}
                  />
                </View>
                <View style={s.paymentInfo}>
                  <Text style={[s.paymentName, { color: colors.text }]}>{payment.payerName || "Anonymous"}</Text>
                  <Text style={s.paymentMeta}>
                    {fmt(payment.createdAt)} · {fmtTime(payment.createdAt)}
                  </Text>
                  {payment.reference && (
                    <Text style={s.paymentRef}>Ref: {payment.reference}</Text>
                  )}
                </View>
                <View style={s.paymentRight}>
                  <Text style={[s.paymentAmount, { color: GREEN }]}>
                    +{link.currency} {parseFloat(payment.amount).toFixed(2)}
                  </Text>
                  <View style={[s.paymentStatusBadge, { backgroundColor: payment.status === "completed" ? "#ECFDF5" : "#FEF3C7" }]}>
                    <Text style={[s.paymentStatusText, { color: payment.status === "completed" ? GREEN : AMBER }]}>
                      {payment.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Invoice Info */}
        {link.invoice && (
          <View style={[s.section, { backgroundColor: colors.card }]}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>INVOICE DETAILS</Text>
            {link.invoice.customerName && (
              <InfoRow label="Customer" value={link.invoice.customerName} icon="person-outline" colors={colors} />
            )}
            {link.invoice.customerEmail && (
              <InfoRow label="Email" value={link.invoice.customerEmail} icon="mail-outline" colors={colors} />
            )}
            {link.invoice.dueDate && (
              <InfoRow label="Due Date" value={fmt(link.invoice.dueDate)} icon="calendar-outline" colors={colors} />
            )}
            {link.invoice.type && (
              <InfoRow label="Type" value={link.invoice.type.charAt(0).toUpperCase() + link.invoice.type.slice(1)} icon="document-text-outline" colors={colors} />
            )}
            {link.invoice.items && link.invoice.items.length > 0 && (
              <View style={s.invoiceItems}>
                <Text style={[s.invoiceItemsTitle, { color: colors.textSecondary }]}>Items</Text>
                {link.invoice.items.map((item, i) => (
                  <View key={i} style={s.invoiceItem}>
                    <Text style={[s.invoiceItemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[s.invoiceItemAmt, { color: colors.textSecondary }]}>
                      {item.quantity} × {link.currency} {item.unitPrice.toFixed(2)}
                    </Text>
                    <Text style={[s.invoiceItemTotal, { color: colors.text }]}>
                      {link.currency} {(item.quantity * item.unitPrice).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {link.invoice.notes && (
              <View style={[s.notesBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.notesText, { color: colors.textSecondary }]}>{link.invoice.notes}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value, icon, colors }: { label: string; value: string; icon: any; colors: any }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoRowLeft}>
        <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <Text style={[s.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[s.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFound: { fontSize: 16, fontWeight: "600" },
  backFallbackBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: PRIMARY, borderRadius: 12 },
  backFallbackText: { color: "#fff", fontWeight: "700" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  headerShareBtn: { padding: 6, marginLeft: 4 },

  heroCard: {
    margin: 16, borderRadius: 20, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heroStatus: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.9)" },
  heroAmount: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1, marginBottom: 4 },
  heroDesc: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 12 },
  heroProgress: { marginBottom: 16 },
  progressTrack: { height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 4 },
  progressLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 6, fontWeight: "600" },
  amountRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 14, marginTop: 4 },
  amountPill: { flex: 1, alignItems: "center" },
  amountPillDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  amountPillLabel: { fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4, fontWeight: "600" },
  amountPillValue: { fontSize: 14, fontWeight: "800", color: "#fff" },

  actionsCard: {
    flexDirection: "row", gap: 10, marginHorizontal: 16, marginBottom: 12,
    padding: 14, borderRadius: 16,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 12,
  },
  actionBtnOutline: { borderWidth: 1.5 },
  actionBtnDanger: { borderWidth: 1.5, borderColor: RED + "40" },
  actionBtnTextWhite: { color: "#fff", fontWeight: "700", fontSize: 13 },
  actionBtnTextOutline: { fontWeight: "700", fontSize: 13 },
  actionBtnTextDanger: { color: RED, fontWeight: "700", fontSize: 13 },

  section: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 14 },

  urlRow: {
    flexDirection: "row", alignItems: "center", borderRadius: 10,
    borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10,
  },
  urlText: { flex: 1, fontSize: 13, fontWeight: "600" },
  urlCopyBtn: { padding: 4, marginLeft: 8 },

  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  infoRowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  infoLabel: { fontSize: 13, fontWeight: "500" },
  infoValue: { fontSize: 13, fontWeight: "600", maxWidth: "55%", textAlign: "right" },

  emptyPayments: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyPaymentsText: { fontSize: 15, fontWeight: "600" },
  emptyPaymentsSub: { fontSize: 13, color: "#9CA3AF", textAlign: "center" },

  paymentItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  paymentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  paymentMeta: { fontSize: 12, color: "#9CA3AF" },
  paymentRef: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  paymentRight: { alignItems: "flex-end", gap: 4 },
  paymentAmount: { fontSize: 15, fontWeight: "800" },
  paymentStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  paymentStatusText: { fontSize: 11, fontWeight: "700" },

  invoiceItems: { marginTop: 8 },
  invoiceItemsTitle: { fontSize: 12, fontWeight: "700", marginBottom: 8, letterSpacing: 0.3 },
  invoiceItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  invoiceItemName: { flex: 1, fontSize: 13, fontWeight: "600" },
  invoiceItemAmt: { fontSize: 12 },
  invoiceItemTotal: { fontSize: 13, fontWeight: "700", minWidth: 70, textAlign: "right" },

  notesBox: { marginTop: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  notesText: { fontSize: 13, lineHeight: 20 },
});
