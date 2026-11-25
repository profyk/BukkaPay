import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useToast } from "../hooks/use-toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../lib/ThemeContext";
import { getPinStatus, setTransactionPin } from "../lib/api";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import PinPrompt from "../components/PinPrompt";

type LimitRow = { currency: string; perPayment: string | null; daily: string | null; spentToday: string
                  pending: { perPayment: string | null; daily: string | null; effectiveAt: string } | null };

export default function SecuritySettings() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors } = useTheme();
  // Limits live on the server and are enforced on every payment (not just saved on this phone).
  const [limits, setLimits] = useState<{ increaseDelayHours: number; wallets: LimitRow[] } | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [transactionLimit, setTransactionLimit] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [limitPinOpen, setLimitPinOpen] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const refreshPinStatus = async () => {
    try {
      const status = await getPinStatus();
      setHasPin(status.hasPin);
    } catch {}
  };

  const loadLimits = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/account/limits`, { headers: await getAuthHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setLimits(data);
      const first = data.wallets.find((w: LimitRow) => w.currency === currency) ?? data.wallets[0];
      if (first) { setCurrency(first.currency); setTransactionLimit(first.perPayment ?? ""); setDailyLimit(first.daily ?? ""); }
    } catch {}
  };

  useEffect(() => { refreshPinStatus(); loadLimits(); }, []);

  const pickCurrency = (c: string) => {
    const w = limits?.wallets.find((x) => x.currency === c);
    setCurrency(c); setTransactionLimit(w?.perPayment ?? ""); setDailyLimit(w?.daily ?? "");
  };

  const handleSaveLimits = async (pin: string) => {
    const res = await fetch(`${API_BASE}/api/account/limits`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
      body: JSON.stringify({ currency, perPayment: transactionLimit.trim() || null, daily: dailyLimit.trim() || null, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Couldn't save your limits");
    setLimitPinOpen(false);
    await loadLimits();
    toast({ title: "Limits saved", description: data.pending
      ? `Lower limits apply now. Higher limits start in ${limits?.increaseDelayHours ?? 24} hours, to protect you if your phone is taken.`
      : "Your limits apply to every payment from now." });
  };

  const handleChangePin = async () => {
    if (hasPin && !currentPin) {
      toast({ title: "Error", description: "Enter your current PIN", variant: "destructive" });
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      toast({ title: "Error", description: "PIN must be 4 to 6 digits", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "Error", description: "PINs do not match", variant: "destructive" });
      return;
    }
    setSavingPin(true);
    try {
      await setTransactionPin(newPin, hasPin ? currentPin : undefined);
      setShowPinModal(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      await refreshPinStatus();
      toast({ title: "Success", description: hasPin ? "PIN updated successfully" : "Transaction PIN set — you'll need it for every payment" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not update PIN", variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(tabs)/profile" as any)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Security Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.statusBox, !hasPin && { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
        <Ionicons name={hasPin ? "checkmark-circle" : "alert-circle"} size={20} color={hasPin ? "#10B981" : "#D97706"} style={{ marginTop: 2 }} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.statusTitle}>{hasPin ? "Payments are protected by your PIN" : "Set your transaction PIN"}</Text>
          <Text style={styles.statusSubtitle}>{hasPin ? "Add spending limits below for extra protection." : "You need a PIN before you can pay anyone."}</Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>AUTHENTICATION</Text>
      <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.settingRow}>
          <Ionicons name="finger-print" size={20} color={colors.primary} />
          <View style={styles.settingTextBox}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Transaction PIN</Text>
            <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
              {hasPin === null ? "Checking…" : hasPin ? "Required for every payment and transfer" : "Not set — required before you can pay anyone"}
            </Text>
          </View>
          <Ionicons name={hasPin ? "checkmark-circle" : "alert-circle"} size={20} color={hasPin ? "#10B981" : "#F59E0B"} />
        </View>

        <View style={[styles.settingDivider, { backgroundColor: colors.divider }]} />

        <TouchableOpacity onPress={() => router.push("/(screens)/notification-settings" as any)} style={styles.settingRow}>
          <Ionicons name="notifications" size={20} color={colors.primary} />
          <View style={styles.settingTextBox}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Sign-in and security alerts</Text>
            <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Choose how we alert you about new sign-ins and payments</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[styles.settingDivider, { backgroundColor: colors.divider }]} />

        <TouchableOpacity onPress={() => setShowPinModal(true)} style={styles.settingRow}>
          <Ionicons name="lock-closed" size={20} color={colors.primary} />
          <View style={styles.settingTextBox}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>{hasPin ? "Change PIN" : "Set Transaction PIN"}</Text>
            <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{hasPin ? "Update your transaction PIN" : "Set a 4-6 digit PIN to start making payments"}</Text>
          </View>
          <Ionicons name="key" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SPENDING LIMITS</Text>
      <View style={[styles.limitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {!limits ? <Text style={{ color: colors.textMuted }}>Loading…</Text> : !limits.wallets.length ? (
          <Text style={{ color: colors.textMuted }}>Open a wallet to set limits.</Text>
        ) : (
          <>
            {limits.wallets.length > 1 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {limits.wallets.map((w) => (
                  <TouchableOpacity key={w.currency} onPress={() => pickCurrency(w.currency)}
                    style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6,
                             borderColor: currency === w.currency ? colors.primary : colors.border,
                             backgroundColor: currency === w.currency ? colors.primary : "transparent" }}>
                    <Text style={{ color: currency === w.currency ? "#fff" : colors.text, fontWeight: "700" }}>{w.currency}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[styles.limitLabel, { color: colors.text }]}>Most per payment</Text>
            <View style={styles.limitInputRow}>
              <Text style={[styles.dollarSign, { color: colors.textMuted }]}>{currency}</Text>
              <TextInput value={transactionLimit} onChangeText={(t) => setTransactionLimit(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad"
                placeholder="No limit" placeholderTextColor={colors.textMuted} accessibilityLabel="Most per payment"
                style={[styles.limitInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]} />
            </View>
            <Text style={[styles.limitLabel, { color: colors.text, marginTop: 16 }]}>Most per day</Text>
            <View style={styles.limitInputRow}>
              <Text style={[styles.dollarSign, { color: colors.textMuted }]}>{currency}</Text>
              <TextInput value={dailyLimit} onChangeText={(t) => setDailyLimit(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad"
                placeholder="No limit" placeholderTextColor={colors.textMuted} accessibilityLabel="Most per day"
                style={[styles.limitInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]} />
            </View>
            {(() => {
              const w = limits.wallets.find((x) => x.currency === currency);
              return (
                <>
                  <Text style={[styles.limitHint, { color: colors.textMuted }]}>Spent in the last 24 hours: {currency} {w?.spentToday ?? "0.00"}. Leave empty for no limit.</Text>
                  {w?.pending && (
                    <Text style={[styles.limitHint, { color: "#B45309" }]}>
                      Higher limits (per payment {w.pending.perPayment ?? "no limit"}, per day {w.pending.daily ?? "no limit"}) start {new Date(w.pending.effectiveAt).toLocaleString()}.
                    </Text>
                  )}
                </>
              );
            })()}
            <Text style={[styles.limitHint, { color: colors.textMuted }]}>Lowering a limit works straight away. Raising one takes {limits.increaseDelayHours} hours, so a thief with your phone can't lift it.</Text>
            <TouchableOpacity onPress={() => setLimitPinOpen(true)} style={styles.saveLimitsButton}>
              <Text style={styles.saveLimitsButtonText}>Save limits</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <PinPrompt visible={limitPinOpen} title="Confirm limits" subtitle={`Spending limits for ${currency ?? ""}`}
        onCancel={() => setLimitPinOpen(false)} onSubmit={handleSaveLimits} />

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SECURITY TIPS</Text>
      <View style={styles.tipsBox}>
        <Ionicons name="shield" size={20} color="#D97706" style={{ marginTop: 2 }} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.tipsTitle}>Stay Safe</Text>
          <Text style={styles.tipItem}>Never share your PIN or password</Text>
          <Text style={styles.tipItem}>Set spending limits you're comfortable with</Text>
          <Text style={styles.tipItem}>Review your transactions regularly</Text>
          <Text style={styles.tipItem}>Log out on shared devices</Text>
        </View>
      </View>

      <Modal visible={showPinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{hasPin ? "Change PIN" : "Set Transaction PIN"}</Text>
              <TouchableOpacity onPress={() => setShowPinModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {hasPin && (
              <>
                <Text style={[styles.modalLabel, { color: colors.text }]}>Current PIN</Text>
                <View style={[styles.pinInputRow, { borderColor: colors.border }]}>
                  <TextInput
                    value={currentPin}
                    onChangeText={setCurrentPin}
                    secureTextEntry={!showCurrentPin}
                    placeholder="Enter current PIN"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={[styles.pinInput, { color: colors.text }]}
                  />
                  <TouchableOpacity onPress={() => setShowCurrentPin(!showCurrentPin)}>
                    <Ionicons name={showCurrentPin ? "eye-off" : "eye"} size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={[styles.modalLabel, { color: colors.text }]}>New PIN</Text>
            <View style={[styles.pinInputRow, { borderColor: colors.border }]}>
              <TextInput
                value={newPin}
                onChangeText={setNewPin}
                secureTextEntry={!showNewPin}
                placeholder="Enter new PIN"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.pinInput, { color: colors.text }]}
              />
              <TouchableOpacity onPress={() => setShowNewPin(!showNewPin)}>
                <Ionicons name={showNewPin ? "eye-off" : "eye"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Confirm New PIN</Text>
            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              secureTextEntry
              placeholder="Confirm new PIN"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
            />

            <TouchableOpacity onPress={handleChangePin} style={[styles.updatePinButton, savingPin && { opacity: 0.6 }]} disabled={savingPin}>
              <Text style={styles.updatePinButtonText}>{savingPin ? "Saving…" : hasPin ? "Update PIN" : "Set PIN"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingBottom: 100, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1A1A2E" },
  statusBox: { flexDirection: "row", backgroundColor: "rgba(16,185,129,0.1)", borderWidth: 1, borderColor: "rgba(16,185,129,0.3)", borderRadius: 12, padding: 16, marginBottom: 24 },
  statusTitle: { fontSize: 14, fontWeight: "600", color: "#10B981" },
  statusSubtitle: { fontSize: 12, color: "rgba(16,185,129,0.7)", marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "500", color: "#6B7280", marginBottom: 12, letterSpacing: 0.5 },
  settingsCard: { backgroundColor: "#F8F9FA", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 24, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 16 },
  settingTextBox: { flex: 1, marginLeft: 12, marginRight: 12 },
  settingTitle: { fontSize: 14, fontWeight: "500", color: "#1A1A2E" },
  settingDesc: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  settingDivider: { height: 1, backgroundColor: "#E5E7EB" },
  limitsCard: { backgroundColor: "#F8F9FA", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", padding: 16, marginBottom: 24 },
  limitLabel: { fontSize: 14, fontWeight: "500", color: "#1A1A2E", marginBottom: 8 },
  limitInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollarSign: { fontSize: 16, color: "#6B7280" },
  limitInput: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, fontSize: 15, color: "#1A1A2E", backgroundColor: "#FFFFFF" },
  limitHint: { fontSize: 12, color: "#6B7280", marginTop: 4 },
  saveLimitsButton: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  saveLimitsButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  tipsBox: { flexDirection: "row", backgroundColor: "rgba(217,119,6,0.1)", borderWidth: 1, borderColor: "rgba(217,119,6,0.3)", borderRadius: 12, padding: 16, marginBottom: 24 },
  tipsTitle: { fontSize: 14, fontWeight: "600", color: "#D97706", marginBottom: 8 },
  tipItem: { fontSize: 12, color: "rgba(217,119,6,0.8)", marginBottom: 4 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  modalLabel: { fontSize: 14, fontWeight: "500", color: "#1A1A2E", marginBottom: 8, marginTop: 16 },
  pinInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  pinInput: { flex: 1, fontSize: 16, color: "#1A1A2E" },
  modalInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, fontSize: 15, color: "#1A1A2E" },
  updatePinButton: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  updatePinButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
