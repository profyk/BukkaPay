import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../../lib/ThemeContext";
import { API_BASE } from "../../lib/config";
import { getAuthHeader } from "../../lib/auth";
import AppBar from "../../components/AppBar";

type Claim = {
  id: string;
  recipientName: string;
  recipientContact: string;
  amount: string;
  currency: string;
  note?: string;
  status: string;
  claimed: boolean;
  claimMethod?: string;
  pickupStatus?: string;
  expiresAt: string;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B",
  completed: "#10B981",
  cancelled: "#EF4444",
};

const STATUS_ICON: Record<string, any> = {
  pending: "time-outline",
  completed: "checkmark-circle-outline",
  cancelled: "close-circle-outline",
};

const METHOD_LABEL: Record<string, string> = {
  bank: "Bank Transfer",
  wallet: "BukkaPay Wallet",
  cash: "Cash Pickup",
};

export default function MyClaimsScreen() {
  const { colors } = useTheme();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { fetchClaims(); }, []));

  async function fetchClaims() {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/claim-payments/mine`, { headers });
      const data = await res.json();
      if (res.ok) setClaims(data.reverse());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  async function cancel(claim: Claim) {
    Alert.alert(
      "Cancel & Refund",
      `Cancel this claim and refund R${parseFloat(claim.amount).toFixed(2)} to your wallet?`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel & Refund", style: "destructive", onPress: async () => {
            setCancellingId(claim.id);
            try {
              const headers = await getAuthHeader();
              const res = await fetch(`${API_BASE}/api/claim-payments/${claim.id}`, { method: "DELETE", headers });
              const data = await res.json();
              if (!res.ok) { Alert.alert("Error", data.error); return; }
              Alert.alert("Refunded", data.message);
              fetchClaims();
            } catch {
              Alert.alert("Error", "Network error. Try again.");
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  }

  async function shareLink(claim: Claim) {
    const url = `https://app.bukkapay.com/claim/${claim.id}`;
    try {
      await Share.share({
        message: `Hi ${claim.recipientName}, I sent you R${parseFloat(claim.amount).toFixed(2)} via BukkaPay!\nClaim it here: ${url}\n\nPlease use the PIN I shared with you separately.`,
        url,
      });
    } catch {}
  }

  const s = styles(colors);

  const pending = claims.filter(c => c.status === "pending");
  const completed = claims.filter(c => c.status === "completed");
  const cancelled = claims.filter(c => c.status === "cancelled");

  function renderClaim(claim: Claim) {
    const symbol = claim.currency === "ZAR" ? "R" : "$";
    const expired = new Date() > new Date(claim.expiresAt);
    const statusColor = STATUS_COLOR[expired && claim.status === "pending" ? "cancelled" : claim.status] || "#6B7280";
    const statusLabel = expired && claim.status === "pending" ? "Expired" : claim.status.charAt(0).toUpperCase() + claim.status.slice(1);

    return (
      <View key={claim.id} style={s.claimCard}>
        <View style={s.claimTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.claimName}>{claim.recipientName}</Text>
            <Text style={s.claimContact}>{claim.recipientContact}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: statusColor + "22" }]}>
            <Ionicons name={STATUS_ICON[claim.status] || "help-circle-outline"} size={14} color={statusColor} />
            <Text style={[s.badgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={s.claimAmount}>
          <Text style={s.claimAmountText}>{symbol}{parseFloat(claim.amount).toFixed(2)}</Text>
          {claim.claimMethod && (
            <Text style={s.methodChip}>via {METHOD_LABEL[claim.claimMethod] || claim.claimMethod}</Text>
          )}
        </View>

        {claim.note ? <Text style={s.claimNote}>"{claim.note}"</Text> : null}

        <View style={s.claimMeta}>
          <Text style={s.metaText}>Sent: {new Date(claim.createdAt).toLocaleDateString()}</Text>
          <Text style={s.metaText}>Expires: {new Date(claim.expiresAt).toLocaleDateString()}</Text>
        </View>

        {claim.status === "pending" && !expired && (
          <View style={s.claimActions}>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary }]} onPress={() => shareLink(claim)}>
              <Ionicons name="share-social" size={14} color="#fff" />
              <Text style={s.actionBtnText}>Share Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => cancel(claim)} disabled={cancellingId === claim.id}>
              {cancellingId === claim.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="close" size={14} color="#fff" /><Text style={s.actionBtnText}>Cancel</Text></>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppBar title="My Sent Claims" showBack />
      {loading
        ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        : (
          <ScrollView
            contentContainerStyle={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchClaims(); }} />}
          >
            {claims.length === 0 && (
              <View style={s.empty}>
                <Ionicons name="send-outline" size={64} color={colors.border} />
                <Text style={s.emptyTitle}>No claims yet</Text>
                <Text style={s.emptyText}>Send money to anyone — even without a BukkaPay account.</Text>
              </View>
            )}

            {pending.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Pending ({pending.length})</Text>
                {pending.map(renderClaim)}
              </>
            )}
            {completed.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Completed ({completed.length})</Text>
                {completed.map(renderClaim)}
              </>
            )}
            {cancelled.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Cancelled ({cancelled.length})</Text>
                {cancelled.map(renderClaim)}
              </>
            )}
          </ScrollView>
        )}
    </View>
  );
}

const styles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 8 },
  claimCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  claimTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  claimName: { fontSize: 16, fontWeight: "700", color: colors.text },
  claimContact: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  claimAmount: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  claimAmountText: { fontSize: 24, fontWeight: "700", color: colors.text },
  methodChip: { backgroundColor: colors.primaryLight, color: colors.primary, fontSize: 12, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  claimNote: { color: colors.textSecondary, fontSize: 13, fontStyle: "italic", marginBottom: 8 },
  claimMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  metaText: { color: colors.textSecondary, fontSize: 12 },
  claimActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 10, gap: 6 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { color: colors.textSecondary, textAlign: "center", fontSize: 14 },
});
