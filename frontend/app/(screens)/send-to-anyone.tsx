import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Share, Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/ThemeContext";
import { API_BASE } from "../../lib/config";
import { getAuthHeader } from "../../lib/auth";
import AppBar from "../../components/AppBar";

const STEPS = ["Recipient", "Amount", "Security PIN", "Review"];

export default function SendToAnyoneScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [copied, setCopied] = useState(false);

  // Form fields
  const [recipientName, setRecipientName] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Result
  const [claimUrl, setClaimUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v);
  const isPhone = (v: string) => /^\+?[\d\s\-]{7,}$/.test(v);

  function validateStep(): boolean {
    setInlineError("");
    if (step === 0) {
      if (!recipientName.trim()) { setInlineError("Recipient name is required."); return false; }
      if (!recipientContact.trim() || (!isEmail(recipientContact) && !isPhone(recipientContact))) {
        setInlineError("Enter a valid email address or phone number."); return false;
      }
    }
    if (step === 1) {
      const n = parseFloat(amount);
      if (isNaN(n) || n <= 0) { setInlineError("Enter a valid amount greater than zero."); return false; }
    }
    if (step === 2) {
      if (!/^\d{4,6}$/.test(pin)) { setInlineError("PIN must be 4–6 digits (numbers only)."); return false; }
      if (pin !== confirmPin) { setInlineError("PINs do not match. Please try again."); return false; }
    }
    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep(s => s + 1);
  }

  async function submit() {
    setInlineError("");
    setLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/claim-payments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName, recipientContact, amount: parseFloat(amount), note, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInlineError(data.error || "Failed to create claim. Please try again.");
        return;
      }
      setClaimUrl(data.claimUrl);
      setExpiresAt(new Date(data.expiresAt).toLocaleDateString());
      setStep(4);
    } catch {
      setInlineError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const shareMessage = `Hi ${recipientName}, you have been sent R${parseFloat(amount || "0").toFixed(2)} via BukkaPay!\n\nClaim your money here:\n${claimUrl}\n\nYou will need the secret PIN that was shared with you privately.\n\nLink expires: ${expiresAt}`;

  async function copyLink() {
    await Clipboard.setStringAsync(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function shareViaWhatsApp() {
    const url = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) { await Linking.openURL(url); } else { await shareNative(); }
    } catch { await shareNative(); }
  }

  async function shareViaEmail() {
    const subject = encodeURIComponent(`BukkaPay: ${recipientName} has money to claim`);
    const body = encodeURIComponent(shareMessage);
    try { await Linking.openURL(`mailto:?subject=${subject}&body=${body}`); } catch { await shareNative(); }
  }

  async function shareViaSMS() {
    const body = encodeURIComponent(shareMessage);
    const url = Platform.OS === "ios" ? `sms:&body=${body}` : `sms:?body=${body}`;
    try { await Linking.openURL(url); } catch { await shareNative(); }
  }

  async function shareNative() {
    try { await Share.share({ message: shareMessage, url: claimUrl }); } catch {}
  }

  const s = styles(colors);

  return (
    <View style={s.container}>
      <AppBar title="Send to Anyone" showBack />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Stepper */}
          {step < 4 && (
            <View style={s.stepper}>
              {STEPS.map((_, i) => (
                <View key={i} style={s.stepItem}>
                  <View style={[s.stepDot, { backgroundColor: i <= step ? colors.primary : colors.border }]}>
                    {i < step
                      ? <Ionicons name="checkmark" size={12} color="#fff" />
                      : <Text style={s.stepNum}>{i + 1}</Text>}
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[s.stepLine, { backgroundColor: i < step ? colors.primary : colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Inline error banner */}
          {inlineError ? (
            <View style={s.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={s.errorBannerText}>{inlineError}</Text>
            </View>
          ) : null}

          {/* STEP 0 — Recipient */}
          {step === 0 && (
            <View style={s.card}>
              <Text style={s.stepTitle}>Who are you sending to?</Text>
              <Text style={s.label}>Recipient Name</Text>
              <TextInput style={s.input} placeholder="Full name" placeholderTextColor={colors.textSecondary}
                value={recipientName} onChangeText={t => { setRecipientName(t); setInlineError(""); }} />
              <Text style={s.label}>Email or Phone</Text>
              <TextInput style={s.input} placeholder="email@example.com or +27..." placeholderTextColor={colors.textSecondary}
                value={recipientContact} onChangeText={t => { setRecipientContact(t); setInlineError(""); }}
                keyboardType="email-address" autoCapitalize="none" />
              <Text style={s.label}>Note (optional)</Text>
              <TextInput style={[s.input, { minHeight: 80 }]} placeholder="What's this for?" placeholderTextColor={colors.textSecondary}
                value={note} onChangeText={setNote} multiline />
              <TouchableOpacity style={s.btn} onPress={next}>
                <Text style={s.btnText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 1 — Amount */}
          {step === 1 && (
            <View style={s.card}>
              <Text style={s.stepTitle}>How much?</Text>
              <View style={s.amountRow}>
                <Text style={s.currency}>R</Text>
                <TextInput style={s.amountInput} placeholder="0.00" placeholderTextColor={colors.textSecondary}
                  value={amount} onChangeText={t => { setAmount(t); setInlineError(""); }} keyboardType="decimal-pad" />
              </View>
              <Text style={s.hint}>Money will be held in escrow until {recipientName} claims it.</Text>
              <TouchableOpacity style={s.btn} onPress={next}>
                <Text style={s.btnText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2 — PIN */}
          {step === 2 && (
            <View style={s.card}>
              <Text style={s.stepTitle}>Set a Secret PIN</Text>
              <View style={s.warningBox}>
                <Ionicons name="shield-checkmark" size={20} color="#F59E0B" />
                <Text style={s.warningText}>
                  Share this PIN privately with {recipientName}.{"\n"}BukkaPay will NOT send it for you.
                </Text>
              </View>
              <Text style={s.label}>Secret PIN (4–6 digits)</Text>
              <TextInput style={s.input} placeholder="••••" placeholderTextColor={colors.textSecondary}
                value={pin} onChangeText={t => { setPin(t); setInlineError(""); }}
                keyboardType="number-pad" secureTextEntry maxLength={6} />
              <Text style={s.label}>Confirm PIN</Text>
              <TextInput style={s.input} placeholder="••••" placeholderTextColor={colors.textSecondary}
                value={confirmPin} onChangeText={t => { setConfirmPin(t); setInlineError(""); }}
                keyboardType="number-pad" secureTextEntry maxLength={6} />
              <TouchableOpacity style={s.btn} onPress={next}>
                <Text style={s.btnText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3 — Review */}
          {step === 3 && (
            <View style={s.card}>
              <Text style={s.stepTitle}>Review & Send</Text>
              {[
                { label: "Recipient", value: recipientName },
                { label: "Contact", value: recipientContact },
                { label: "Amount", value: `R ${parseFloat(amount).toFixed(2)}` },
                { label: "Note", value: note || "—" },
                { label: "Expires in", value: "7 days" },
              ].map(row => (
                <View key={row.label} style={s.reviewRow}>
                  <Text style={s.reviewLabel}>{row.label}</Text>
                  <Text style={s.reviewValue}>{row.value}</Text>
                </View>
              ))}
              <View style={s.reviewRow}>
                <Text style={s.reviewLabel}>PIN</Text>
                <Text style={[s.reviewValue, { color: colors.primary }]}>{"•".repeat(pin.length)} (share privately)</Text>
              </View>

              <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={s.btnText}>Confirm & Send</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.outlineBtn} onPress={() => { setStep(0); setInlineError(""); }}>
                <Text style={[s.outlineBtnText, { color: colors.textSecondary }]}>Edit Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4 — Success */}
          {step === 4 && (
            <View>
              <View style={[s.card, { alignItems: "center", paddingVertical: 28 }]}>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={80} color="#10B981" />
                </View>
                <Text style={s.successTitle}>Link Created!</Text>
                <Text style={s.successSub}>
                  R{parseFloat(amount).toFixed(2)} is locked in escrow for{"\n"}{recipientName} — expires {expiresAt}
                </Text>
              </View>

              {/* The link */}
              <View style={[s.card, { borderWidth: 2, borderColor: colors.primary }]}>
                <Text style={s.shareTitle}>Claim Link</Text>
                <Text style={s.shareSub}>Send this link to {recipientName} so they can claim the money</Text>
                <View style={s.claimLinkBox}>
                  <Text style={s.claimLinkText} selectable numberOfLines={3}>{claimUrl}</Text>
                </View>
                <TouchableOpacity style={s.copyBtn} onPress={copyLink} activeOpacity={0.7}>
                  <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={colors.primary} />
                  <Text style={[s.copyBtnText, { color: colors.primary }]}>
                    {copied ? "Copied!" : "Tap to Copy Link"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Share channels */}
              <View style={s.card}>
                <Text style={s.shareTitle}>Send via</Text>
                <TouchableOpacity style={[s.shareBtn, { backgroundColor: "#25D366" }]} onPress={shareViaWhatsApp} activeOpacity={0.85}>
                  <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                  <Text style={s.shareBtnText}>WhatsApp</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.shareBtn, { backgroundColor: "#2563EB" }]} onPress={shareViaEmail} activeOpacity={0.85}>
                  <Ionicons name="mail" size={24} color="#fff" />
                  <Text style={s.shareBtnText}>Email</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity style={[s.shareBtn, { backgroundColor: "#7C3AED" }]} onPress={shareViaSMS} activeOpacity={0.85}>
                  <Ionicons name="chatbubble" size={24} color="#fff" />
                  <Text style={s.shareBtnText}>SMS</Text>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <TouchableOpacity style={s.shareNativeBtn} onPress={shareNative} activeOpacity={0.7}>
                  <Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
                  <Text style={[s.shareNativeBtnText, { color: colors.textSecondary }]}>More sharing options</Text>
                </TouchableOpacity>
              </View>

              {/* PIN reminder */}
              <View style={s.warningBox}>
                <Ionicons name="lock-closed" size={18} color="#D97706" />
                <Text style={s.warningText}>
                  Send the secret PIN to {recipientName} <Text style={{ fontWeight: "700" }}>separately</Text> — not in the same message as the link.
                </Text>
              </View>

              <TouchableOpacity style={s.btn} onPress={() => router.push("/(screens)/my-claims" as any)}>
                <Ionicons name="list" size={18} color="#fff" />
                <Text style={s.btnText}>My Sent Payments</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={() => router.back()}>
                <Text style={[s.outlineBtnText, { color: colors.textSecondary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 40 },

  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNum: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepLine: { width: 32, height: 2, marginHorizontal: 2 },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: "#FECACA",
  },
  errorBannerText: { flex: 1, color: "#DC2626", fontSize: 14, lineHeight: 20 },

  card: { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
  stepTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 20 },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  amountRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  currency: { fontSize: 32, fontWeight: "700", color: colors.text, marginRight: 8 },
  amountInput: {
    flex: 1, fontSize: 40, fontWeight: "700", color: colors.primary,
    borderBottomWidth: 2, borderColor: colors.primary, paddingBottom: 8,
  },
  hint: { color: colors.textSecondary, fontSize: 13, marginBottom: 16, fontStyle: "italic" },
  warningBox: {
    flexDirection: "row", backgroundColor: "#FEF3C7", borderRadius: 10,
    padding: 12, gap: 10, marginBottom: 16, alignItems: "flex-start",
  },
  warningText: { flex: 1, color: "#92400E", fontSize: 13, lineHeight: 18 },

  btn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 20, gap: 6,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  outlineBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingVertical: 12, alignItems: "center", marginTop: 10,
    flexDirection: "row", justifyContent: "center",
  },
  outlineBtnText: { fontWeight: "600", fontSize: 15 },

  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.divider },
  reviewLabel: { color: colors.textSecondary, fontSize: 14 },
  reviewValue: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },

  successIcon: { alignItems: "center", marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 },
  successSub: { color: colors.textSecondary, textAlign: "center", marginBottom: 16, fontSize: 14, lineHeight: 20 },

  shareTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 4 },
  shareSub: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  claimLinkBox: {
    backgroundColor: colors.inputBg, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10,
  },
  claimLinkText: { color: colors.primary, fontSize: 13, fontWeight: "600", lineHeight: 20, letterSpacing: 0.2 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.primary,
  },
  copyBtnText: { fontWeight: "600", fontSize: 14 },

  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10,
  },
  shareBtnText: { color: "#fff", fontWeight: "700", fontSize: 16, flex: 1 },
  shareNativeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, marginTop: 2,
  },
  shareNativeBtnText: { fontSize: 14 },
});
