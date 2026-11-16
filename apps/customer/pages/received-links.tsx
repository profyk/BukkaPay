import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert, RefreshControl,
  KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import PinPrompt from "../components/PinPrompt";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const AMBER = "#F59E0B";
const BLUE = "#3B82F6";
const RED = "#EF4444";

interface ReceivedLink {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  status: string;
  amountPaid: string;
  remainingBalance: string;
  allowPartialPayment: boolean;
  minimumPayment: string | null;
  senderName?: string;
  createdAt: string;
  direction: "received";
}

const STATUS_COLORS: Record<string, string> = {
  pending: AMBER, partial: BLUE, paid: GREEN, cancelled: RED,
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", partial: "Partial", paid: "Paid", cancelled: "Cancelled",
};

export default function ReceivedLinks() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [links, setLinks] = useState<ReceivedLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [addUrl, setAddUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [payModal, setPayModal] = useState<ReceivedLink | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [isFullPay, setIsFullPay] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [payError, setPayError] = useState("");

  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLinks(data.filter((l: any) => l.direction === "received"));
      }
    } catch {
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);
  const onRefresh = () => { setRefreshing(true); fetchLinks(); };

  const extractLinkId = (input: string): string | null => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/\/pay\/([a-f0-9-]{36})/i);
    if (urlMatch) return urlMatch[1];
    const uuidMatch = trimmed.match(/^[a-f0-9-]{36}$/i);
    if (uuidMatch) return trimmed;
    return null;
  };

  // react-native-web's Alert.alert() is a no-op — it never shows a dialog or
  // fires button callbacks — so every Alert.alert call in this screen was
  // silently doing nothing on the web build. Route web through window.confirm
  // / window.alert instead; native platforms keep the real Alert.
  const notify = (title: string, message?: string) => {
    if (Platform.OS === "web") { window.alert(message ? `${title}\n\n${message}` : title); return; }
    Alert.alert(title, message);
  };

  const confirm = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, style: "destructive", onPress: onConfirm },
    ]);
  };

  const handleAddLink = async () => {
    const linkId = extractLinkId(addUrl);
    if (!linkId) {
      notify("Invalid Link", "Please paste a valid BukkaPay payment link URL or link ID.");
      return;
    }
    setIsSaving(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links/${linkId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save link");
      setAddUrl("");
      fetchLinks();
      notify("Saved!", "Payment link added to your inbox.");
    } catch (e: any) {
      notify("Error", e.message || "Could not save this link.");
    } finally {
      setIsSaving(false);
    }
  };

  const openPayModal = (link: ReceivedLink) => {
    setPayModal(link);
    setPayAmount(link.remainingBalance);
    setIsFullPay(true);
    setPayError("");
    setIsPaying(false);
  };

  const handleWalletPay = () => {
    if (!payModal) return;
    setPayError("");
    const amount = isFullPay ? payModal.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) {
      setPayError("Please enter a valid amount."); return;
    }
    if (payModal.minimumPayment && parseFloat(amount) < parseFloat(payModal.minimumPayment)) {
      setPayError(`Minimum payment is ${payModal.currency} ${parseFloat(payModal.minimumPayment).toFixed(2)}`); return;
    }
    setShowPinPrompt(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (!payModal) return;
    const amount = isFullPay ? payModal.remainingBalance : payAmount;
    setIsPaying(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links/${payModal.id}/pay-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ amount, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      setShowPinPrompt(false);
      setPayModal(null);
      fetchLinks();
      notify(
        "Payment Successful!",
        `${payModal.currency} ${parseFloat(amount).toFixed(2)} paid successfully via BukkaPay Wallet.`
      );
    } finally {
      setIsPaying(false);
    }
  };

  const handleRemove = (link: ReceivedLink) => {
    confirm(
      "Remove Link",
      `Remove "${link.description || "this payment link"}" from your inbox?`,
      "Remove",
      () => doRemove(link.id)
    );
  };

  const doRemove = async (linkId: string) => {
    setRemovingId(linkId);
    try {
      const headers = await getAuthHeader();
      await fetch(`${API_BASE}/api/payment-links/${linkId}/save`, {
        method: "DELETE",
        headers,
      });
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch {
      notify("Error", "Could not remove this link.");
    } finally {
      setRemovingId(null);
    }
  };

  const currSym = (c: string) => c === "ZAR" ? "R" : c;

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={s.topBarCenter}>
            <Text style={s.topBarTitle}>Received Links</Text>
            <Text style={s.topBarSub}>Pay with BukkaPay Wallet</Text>
          </View>
          <View style={s.topBarBadge}>
            <Text style={s.topBarBadgeText}>{links.length}</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        >
          {/* Add Link Banner */}
          <View style={s.addCard}>
            <View style={s.addCardHeader}>
              <View style={s.addIconWrap}>
                <Ionicons name="link" size={20} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.addCardTitle}>Add a Payment Link</Text>
                <Text style={s.addCardSub}>Paste a BukkaPay link you received</Text>
              </View>
            </View>
            <View style={s.addRow}>
              <TextInput
                style={s.addInput}
                value={addUrl}
                onChangeText={setAddUrl}
                placeholder="https://app.bukkapay.com/pay/..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.addBtn, (!addUrl.trim() || isSaving) && { opacity: 0.5 }]}
                onPress={handleAddLink}
                disabled={!addUrl.trim() || isSaving}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="add" size={22} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Info note */}
          <View style={s.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={BLUE} />
            <Text style={s.infoNoteText}>
              Links you pay via BukkaPay Wallet are automatically saved here.
            </Text>
          </View>

          {/* Empty state */}
          {links.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="file-tray-outline" size={40} color="#C4B5FD" />
              </View>
              <Text style={s.emptyTitle}>No received links yet</Text>
              <Text style={s.emptySubtitle}>
                When someone sends you a payment link, paste it above to add it here and pay with your BukkaPay wallet.
              </Text>
            </View>
          ) : (
            <View style={s.linksList}>
              {links.map(link => {
                const remaining = parseFloat(link.remainingBalance);
                const isPaid = link.status === "paid";
                const statusColor = STATUS_COLORS[link.status] || "#6B7280";
                const progress = parseFloat(link.amount) > 0
                  ? parseFloat(link.amountPaid) / parseFloat(link.amount) : 0;
                const sym = currSym(link.currency);
                return (
                  <View key={link.id} style={[s.card, removingId === link.id && { opacity: 0.4 }]}>
                    <View style={s.cardTop}>
                      <View style={[s.cardIcon, { backgroundColor: statusColor + "18" }]}>
                        <Ionicons
                          name={isPaid ? "checkmark-circle" : "arrow-down-circle"}
                          size={24} color={isPaid ? GREEN : PRIMARY}
                        />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <Text style={s.cardDesc} numberOfLines={1}>
                          {link.description || "Payment Request"}
                        </Text>
                        {link.senderName ? (
                          <Text style={s.cardSender}>From {link.senderName}</Text>
                        ) : null}
                        <Text style={s.cardDate}>
                          {new Date(link.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                      </View>
                      <View style={s.cardRight}>
                        <View style={[s.statusPill, { backgroundColor: statusColor + "18" }]}>
                          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                          <Text style={[s.statusPillText, { color: statusColor }]}>{STATUS_LABELS[link.status]}</Text>
                        </View>
                        <Text style={s.cardAmount}>{sym} {parseFloat(link.amount).toFixed(2)}</Text>
                      </View>
                    </View>

                    {/* Progress bar */}
                    {parseFloat(link.amountPaid) > 0 && !isPaid && (
                      <View style={s.progressWrap}>
                        <View style={s.progressTrack}>
                          <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: statusColor }]} />
                        </View>
                        <Text style={s.progressLabel}>{Math.round(progress * 100)}% paid</Text>
                      </View>
                    )}

                    {/* Amount due */}
                    {!isPaid && (
                      <View style={s.amountDueRow}>
                        <Text style={s.amountDueLabel}>Amount Due</Text>
                        <Text style={[s.amountDueValue, { color: remaining > 0 ? RED : GREEN }]}>
                          {sym} {remaining.toFixed(2)}
                        </Text>
                      </View>
                    )}

                    {/* Actions */}
                    <View style={s.actionsRow}>
                      {!isPaid && (
                        <TouchableOpacity style={s.payBtn} onPress={() => openPayModal(link)}>
                          <Ionicons name="wallet" size={16} color="#fff" />
                          <Text style={s.payBtnText}>Pay with Wallet</Text>
                        </TouchableOpacity>
                      )}
                      {isPaid && (
                        <View style={s.paidBadge}>
                          <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                          <Text style={s.paidBadgeText}>Fully Paid</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={s.removeBtn}
                        onPress={() => handleRemove(link)}
                        disabled={removingId === link.id}
                      >
                        <Ionicons name="trash-outline" size={16} color={RED} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Pay Modal */}
        <Modal
          visible={!!payModal}
          transparent
          animationType="slide"
          onRequestClose={() => !isPaying && setPayModal(null)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />

              <View style={s.modalHeader}>
                <View style={s.modalIconWrap}>
                  <Ionicons name="wallet" size={28} color={PRIMARY} />
                </View>
                <Text style={s.modalTitle}>Pay with BukkaPay Wallet</Text>
                {payModal?.description ? (
                  <Text style={s.modalDesc}>{payModal.description}</Text>
                ) : null}
                <Text style={s.modalAmount}>
                  {payModal ? `${currSym(payModal.currency)} ${parseFloat(payModal.amount).toFixed(2)}` : ""}
                </Text>
              </View>

              {payModal?.allowPartialPayment && (
                <View style={s.amountSection}>
                  <Text style={s.amountSectionLabel}>Payment Amount</Text>
                  <View style={s.toggleRow}>
                    <TouchableOpacity
                      style={[s.toggle, isFullPay && s.toggleActive]}
                      onPress={() => { setIsFullPay(true); setPayAmount(payModal.remainingBalance); }}
                    >
                      <Text style={[s.toggleTxt, isFullPay && s.toggleTxtActive]}>
                        Full ({currSym(payModal.currency)} {parseFloat(payModal.remainingBalance).toFixed(2)})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.toggle, !isFullPay && s.toggleActive]}
                      onPress={() => setIsFullPay(false)}
                    >
                      <Text style={[s.toggleTxt, !isFullPay && s.toggleTxtActive]}>Custom</Text>
                    </TouchableOpacity>
                  </View>
                  {!isFullPay && (
                    <TextInput
                      style={s.amountInput}
                      value={payAmount}
                      onChangeText={setPayAmount}
                      placeholder={`Min: ${payModal.minimumPayment || "any amount"}`}
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                </View>
              )}

              {payError ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={RED} />
                  <Text style={s.errorTxt}>{payError}</Text>
                </View>
              ) : null}

              <View style={s.modalActions}>
                <TouchableOpacity
                  style={[s.modalPayBtn, isPaying && { opacity: 0.7 }]}
                  onPress={handleWalletPay}
                  disabled={isPaying}
                >
                  {isPaying
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="wallet" size={20} color="#fff" />
                        <Text style={s.modalPayBtnText}>
                          Confirm Payment
                          {payModal
                            ? ` · ${currSym(payModal.currency)} ${parseFloat(isFullPay ? payModal.remainingBalance : payAmount || "0").toFixed(2)}`
                            : ""}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setPayModal(null)}
                  disabled={isPaying}
                >
                  <Text style={s.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <View style={s.modalFooter}>
                <Ionicons name="shield-checkmark" size={13} color={GREEN} />
                <Text style={s.modalFooterTxt}>Secured by BukkaPay · Wallet payment is instant</Text>
              </View>
            </View>
          </View>
        </Modal>

        <PinPrompt
          visible={showPinPrompt}
          subtitle={payModal ? `Confirm this payment` : undefined}
          onCancel={() => setShowPinPrompt(false)}
          onSubmit={handlePinSubmit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },

  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.cardBorder,
  },
  backBtn: { padding: 6, marginRight: 8 },
  topBarCenter: { flex: 1 },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  topBarSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  topBarBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  topBarBadgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  addCard: {
    margin: 16, backgroundColor: colors.card, borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: colors.cardBorder,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  addCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  addIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center",
  },
  addCardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  addCardSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  addRow: { flexDirection: "row", gap: 8 },
  addInput: {
    flex: 1, backgroundColor: colors.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.text,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center",
  },

  infoNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  infoNoteText: { flex: 1, fontSize: 12, color: colors.primaryText, lineHeight: 17 },

  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 6, lineHeight: 20 },

  linksList: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: colors.card, borderRadius: 18, padding: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center" },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardDesc: { fontSize: 14, fontWeight: "700", color: colors.text },
  cardSender: { fontSize: 12, color: PRIMARY, fontWeight: "600", marginTop: 1 },
  cardDate: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  cardAmount: { fontSize: 15, fontWeight: "800", color: colors.text },

  progressWrap: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: { flex: 1, height: 5, backgroundColor: colors.divider, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },

  amountDueRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.divider },
  amountDueLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  amountDueValue: { fontSize: 15, fontWeight: "800" },

  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  payBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 11,
  },
  payBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  paidBadge: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#ECFDF5", borderRadius: 12, paddingVertical: 11,
  },
  paidBadgeText: { color: "#059669", fontWeight: "700", fontSize: 14 },
  removeBtn: {
    width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: RED + "30",
    alignItems: "center", justifyContent: "center", backgroundColor: "#FFF5F5",
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: Platform.OS === "ios" ? 40 : 28,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalIconWrap: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 4 },
  modalDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 4, textAlign: "center" },
  modalAmount: { fontSize: 28, fontWeight: "900", color: PRIMARY, marginTop: 4 },

  amountSection: { marginBottom: 16 },
  amountSectionLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginBottom: 8 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
  toggleActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  toggleTxt: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  toggleTxtActive: { color: "#fff" },
  amountInput: {
    backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, fontWeight: "600",
  },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorTxt: { flex: 1, fontSize: 13, color: RED },

  modalActions: { gap: 10 },
  modalPayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 16,
  },
  modalPayBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  modalCancelBtn: { alignItems: "center", paddingVertical: 14 },
  modalCancelTxt: { fontSize: 15, fontWeight: "600", color: colors.textMuted },

  modalFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  modalFooterTxt: { fontSize: 12, color: colors.textMuted },
  });
}
