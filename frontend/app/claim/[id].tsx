import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { API_BASE } from "../../lib/config";
import { getAuthHeader, getCurrentUser } from "../../lib/auth";

const PRIMARY = "#001A72";
const GREEN = "#10B981";
const BG = "#F0F4FF";

type Step = "pin" | "choose" | "bank-form" | "cash-result" | "wallet-form" | "success";

export default function ClaimPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [claim, setClaim] = useState<any>(null);
  const [pageError, setPageError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [copied, setCopied] = useState(false);

  const [step, setStep] = useState<Step>("pin");

  // PIN
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Bank fields
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchCode, setBranchCode] = useState("");

  // Results
  const [pickupCode, setPickupCode] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Auth
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (id) {
      fetchClaim();
      checkAuth();
    }
  }, [id]);

  async function checkAuth() {
    try {
      const user = await getCurrentUser();
      setIsLoggedIn(!!user);
    } catch {
      setIsLoggedIn(false);
    }
  }

  async function fetchClaim() {
    setLoading(true);
    setPageError("");
    try {
      const res = await fetch(`${API_BASE}/api/claim-payments/${id}/public`);
      const data = await res.json();
      if (!res.ok) { setPageError(data.error || "Unable to load claim"); return; }
      if (data.claimed) { setPageError("This payment has already been claimed."); return; }
      if (data.status === "cancelled") { setPageError("This claim has been cancelled by the sender."); return; }
      setClaim(data);
    } catch {
      setPageError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPin() {
    if (!pin || pin.length < 4) { setPinError("Enter your 4–6 digit PIN"); return; }
    setSubmitting(true);
    setPinError("");
    try {
      const res = await fetch(`${API_BASE}/api/claim-payments/${id}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) { setPinError(data.error || "Incorrect PIN"); return; }
      setStep("choose");
    } catch {
      setPinError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function claimBank() {
    if (!accountName || !bankName || !accountNumber) {
      setInlineError("Please fill in Account Name, Bank Name and Account Number."); return;
    }
    setInlineError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/claim-payments/${id}/claim-bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, bankName, accountNumber, branchCode }),
      });
      const data = await res.json();
      if (!res.ok) { setInlineError(data.error || "Failed to submit bank details."); return; }
      setSuccessMsg(data.message || "Bank details submitted. Money will be transferred within 1–2 business days.");
      setStep("success");
    } catch {
      setInlineError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function claimCash() {
    setInlineError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/claim-payments/${id}/claim-cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { setInlineError(data.error || "Failed to generate pickup code."); return; }
      setPickupCode(data.pickupCode);
      setStep("cash-result");
    } catch {
      setInlineError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function claimWallet() {
    setInlineError("");
    setSubmitting(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/claim-payments/${id}/claim-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      });
      const data = await res.json();
      if (!res.ok) { setInlineError(data.error || "Wallet claim failed."); return; }
      setSuccessMsg(data.message || "Money has been added to your BukkaPay wallet!");
      setStep("success");
    } catch {
      setInlineError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode() {
    await Clipboard.setStringAsync(pickupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function formatCode(code: string) {
    return code ? `${code.slice(0, 5)} ${code.slice(5, 10)} ${code.slice(10)}` : "";
  }

  const currency = claim?.currency || "ZAR";
  const symbol = currency === "ZAR" ? "R" : currency;
  const amountDisplay = `${symbol}${parseFloat(claim?.amount || "0").toFixed(2)}`;

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.fullCenter}>
        <View style={s.centerCard}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={s.loadingText}>Loading claim details…</Text>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────
  if (pageError) {
    return (
      <View style={s.fullCenter}>
        <View style={s.centerCard}>
          <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
          <Text style={s.errorTitle}>Claim Unavailable</Text>
          <Text style={s.errorText}>{pageError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchClaim}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ── Success ──────────────────────────────────────────────────
  if (step === "success") {
    return (
      <View style={s.fullCenter}>
        <View style={s.centerCard}>
          <View style={s.successCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Money Claimed!</Text>
          <Text style={s.successMsg}>{successMsg}</Text>
          <View style={s.divider} />
          <Text style={s.successSub}>Thank you for using BukkaPay.</Text>
          <TouchableOpacity style={s.appBtn}
            onPress={() => Linking.openURL("https://app.bukkapay.com")}>
            <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
            <Text style={s.appBtnText}>Open BukkaPay App</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ── Main page ────────────────────────────────────────────────
  return (
    <ScrollView style={s.page} contentContainerStyle={{ paddingBottom: 80 }}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconText}>B</Text></View>
          <Text style={s.logoText}>BukkaPay</Text>
        </View>
        <View style={s.securedBadge}>
          <Ionicons name="lock-closed" size={11} color={GREEN} />
          <Text style={s.securedText}>Secure Link</Text>
        </View>
      </View>

      {/* Amount card */}
      <View style={s.amountCard}>
        <View style={s.senderAvatar}>
          <Text style={s.senderInitial}>
            {(claim?.recipientName || "R")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={s.sentToLabel}>Money sent to</Text>
        <Text style={s.recipientName}>{claim?.recipientName}</Text>
        <Text style={s.amountBig}>{amountDisplay}</Text>
        {claim?.note ? <Text style={s.note}>"{claim.note}"</Text> : null}
        {claim?.expiresAt && (
          <View style={s.expiryRow}>
            <Ionicons name="time-outline" size={13} color="#F59E0B" />
            <Text style={s.expiryText}>
              Expires {new Date(claim.expiresAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
            </Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16 }}>

        {/* ── STEP: PIN ── */}
        {step === "pin" && (
          <View style={s.card}>
            <View style={s.stepHeader}>
              <View style={s.stepBadge}><Text style={s.stepBadgeText}>1</Text></View>
              <Text style={s.cardTitle}>Enter Secret PIN</Text>
            </View>
            <Text style={s.cardSub}>
              The sender shared a secret PIN with you privately. Enter it below to unlock your money.
            </Text>
            <TextInput
              style={s.pinInput}
              placeholder="• • • • • •"
              placeholderTextColor="#9CA3AF"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              textAlign="center"
            />
            {pinError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#EF4444" />
                <Text style={s.errorBoxText}>{pinError}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.7 }]}
              onPress={verifyPin} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="lock-open-outline" size={18} color="#fff" /><Text style={s.primaryBtnText}>Verify PIN</Text></>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Choose method ── */}
        {step === "choose" && (
          <View style={s.card}>
            <View style={s.stepHeader}>
              <View style={[s.stepBadge, { backgroundColor: GREEN }]}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
              <Text style={s.cardTitle}>PIN Verified</Text>
            </View>
            <Text style={s.cardSub}>
              How would you like to receive {amountDisplay}?
            </Text>

            <TouchableOpacity style={s.methodOption}
              onPress={() => { setInlineError(""); setStep("bank-form"); }}
              activeOpacity={0.85}>
              <View style={[s.methodIcon, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="business" size={26} color="#2563EB" />
              </View>
              <View style={s.methodInfo}>
                <Text style={s.methodTitle}>Bank Transfer</Text>
                <Text style={s.methodSub}>Transfer to your bank account · 1–2 business days</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity style={s.methodOption}
              onPress={() => { setInlineError(""); setStep("wallet-form"); }}
              activeOpacity={0.85}>
              <View style={[s.methodIcon, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="wallet" size={26} color={GREEN} />
              </View>
              <View style={s.methodInfo}>
                <Text style={s.methodTitle}>BukkaPay Wallet</Text>
                <Text style={s.methodSub}>Instant · Requires BukkaPay account</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity style={s.methodOption}
              onPress={() => { setInlineError(""); claimCash(); }}
              disabled={submitting}
              activeOpacity={0.85}>
              <View style={[s.methodIcon, { backgroundColor: "#FFF7ED" }]}>
                {submitting
                  ? <ActivityIndicator color="#F59E0B" />
                  : <Ionicons name="cash" size={26} color="#F59E0B" />}
              </View>
              <View style={s.methodInfo}>
                <Text style={s.methodTitle}>Cash Pickup</Text>
                <Text style={s.methodSub}>Get a code · Collect at any BukkaPay agent</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {inlineError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#EF4444" />
                <Text style={s.errorBoxText}>{inlineError}</Text>
              </View>
            ) : null}

            <View style={s.trustRow}>
              <Ionicons name="shield-checkmark" size={14} color={GREEN} />
              <Text style={s.trustText}>All transactions are encrypted and secured by BukkaPay</Text>
            </View>
          </View>
        )}

        {/* ── STEP: Bank form ── */}
        {step === "bank-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backLink}>
              <Ionicons name="arrow-back" size={16} color={PRIMARY} />
              <Text style={s.backLinkText}>Back to options</Text>
            </TouchableOpacity>

            <View style={s.selectedMethod}>
              <Ionicons name="business" size={18} color="#2563EB" />
              <Text style={s.selectedMethodText}>Bank Transfer — {amountDisplay}</Text>
            </View>
            <Text style={s.cardSub}>Enter your bank account where we'll send the money.</Text>

            {[
              { label: "Account Holder Name *", value: accountName, set: setAccountName, placeholder: "Full name on account" },
              { label: "Bank Name *", value: bankName, set: setBankName, placeholder: "e.g. FNB, Capitec, Standard Bank" },
              { label: "Account Number *", value: accountNumber, set: setAccountNumber, placeholder: "Account number", keyboard: "numeric" as any },
              { label: "Branch Code (optional)", value: branchCode, set: setBranchCode, placeholder: "6-digit branch code", keyboard: "numeric" as any },
            ].map(field => (
              <View key={field.label}>
                <Text style={s.inputLabel}>{field.label}</Text>
                <TextInput
                  style={s.input}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9CA3AF"
                  value={field.value}
                  onChangeText={field.set}
                  keyboardType={field.keyboard}
                />
              </View>
            ))}

            {inlineError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#EF4444" />
                <Text style={s.errorBoxText}>{inlineError}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={[s.primaryBtn, submitting && { opacity: 0.7 }]}
              onPress={claimBank} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={s.primaryBtnText}>Submit Bank Details</Text></>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Cash pickup result ── */}
        {step === "cash-result" && pickupCode && (
          <View style={s.card}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={[s.successCircle, { backgroundColor: "#F59E0B", width: 64, height: 64, borderRadius: 32 }]}>
                <Ionicons name="cash" size={30} color="#fff" />
              </View>
            </View>
            <Text style={[s.cardTitle, { textAlign: "center" }]}>Your Pickup Code</Text>
            <Text style={[s.cardSub, { textAlign: "center", marginBottom: 16 }]}>
              Show this code at any BukkaPay cash agent to collect {amountDisplay}. No PIN needed at the agent.
            </Text>

            <TouchableOpacity style={s.codeBox} onPress={copyCode} activeOpacity={0.8}>
              <Text style={s.codeText}>{formatCode(pickupCode)}</Text>
              <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={22} color={copied ? GREEN : "#6B7280"} />
            </TouchableOpacity>
            <Text style={s.codeHint}>{copied ? "Copied!" : "Tap to copy"} · Valid until claimed</Text>

            <View style={s.warningBox}>
              <Ionicons name="shield" size={16} color="#F59E0B" />
              <Text style={s.warningText}>Keep this code secret — only share it at the agent counter.</Text>
            </View>

            <TouchableOpacity style={s.appBtn}
              onPress={() => Linking.openURL("https://app.bukkapay.com")}>
              <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
              <Text style={s.appBtnText}>Open BukkaPay App</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Wallet form ── */}
        {step === "wallet-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backLink}>
              <Ionicons name="arrow-back" size={16} color={PRIMARY} />
              <Text style={s.backLinkText}>Back to options</Text>
            </TouchableOpacity>

            <View style={s.selectedMethod}>
              <Ionicons name="wallet" size={18} color={GREEN} />
              <Text style={s.selectedMethodText}>BukkaPay Wallet — {amountDisplay}</Text>
            </View>

            {isLoggedIn ? (
              <>
                <Text style={s.cardSub}>Tap below to receive {amountDisplay} instantly into your BukkaPay wallet.</Text>
                {inlineError ? (
                  <View style={s.errorBox}>
                    <Ionicons name="alert-circle" size={15} color="#EF4444" />
                    <Text style={s.errorBoxText}>{inlineError}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: GREEN }, submitting && { opacity: 0.7 }]}
                  onPress={claimWallet} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="wallet" size={18} color="#fff" /><Text style={s.primaryBtnText}>Receive to Wallet</Text></>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <Ionicons name="wallet-outline" size={48} color={PRIMARY} style={{ marginBottom: 12 }} />
                <Text style={s.nudgeTitle}>BukkaPay Account Required</Text>
                <Text style={[s.cardSub, { textAlign: "center" }]}>
                  Log in or create a free account to receive {amountDisplay} instantly to your wallet.
                </Text>
                <TouchableOpacity style={[s.primaryBtn, { width: "100%" }]}
                  onPress={() => router.push("/(auth)/login" as any)}>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={s.primaryBtnText}>Log In to BukkaPay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.outlineBtn, { width: "100%" }]}
                  onPress={() => router.push("/(auth)/signup" as any)}>
                  <Text style={s.outlineBtnText}>Create Free Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </View>

      <Text style={[s.poweredBy, { marginTop: 32 }]}>🔒 Secured by BukkaPay</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  fullCenter: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 24 },

  centerCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 36, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12, elevation: 3, maxWidth: 380, width: "100%",
  },
  loadingText: { marginTop: 14, color: "#6B7280", fontSize: 15 },
  errorTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 12 },
  errorText: { color: "#6B7280", textAlign: "center", marginTop: 6, fontSize: 14, lineHeight: 20 },
  retryBtn: { marginTop: 20, backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  successCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: GREEN,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  successTitle: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 8 },
  successMsg: { color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22 },
  divider: { width: "80%", height: 1, backgroundColor: "#F3F4F6", marginVertical: 20 },
  successSub: { color: "#9CA3AF", textAlign: "center", fontSize: 13 },

  header: {
    backgroundColor: PRIMARY, paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 18,
    paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logoIconText: { color: PRIMARY, fontSize: 18, fontWeight: "900" },
  logoText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  securedBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  securedText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  amountCard: {
    margin: 16, backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 5,
  },
  senderAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  senderInitial: { color: "#fff", fontSize: 28, fontWeight: "800" },
  sentToLabel: { fontSize: 12, color: "#9CA3AF", marginBottom: 2 },
  recipientName: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 8 },
  amountBig: { fontSize: 44, fontWeight: "900", color: PRIMARY },
  note: { color: "#6B7280", fontSize: 14, fontStyle: "italic", marginTop: 8, textAlign: "center" },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  expiryText: { color: "#F59E0B", fontSize: 12, fontWeight: "600" },

  card: {
    backgroundColor: "#fff", borderRadius: 20, padding: 18, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  stepBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  cardSub: { color: "#6B7280", fontSize: 14, lineHeight: 20, marginBottom: 12 },

  pinInput: {
    borderWidth: 2, borderColor: PRIMARY, borderRadius: 14, padding: 18,
    fontSize: 28, letterSpacing: 12, color: "#111827", marginVertical: 16,
    textAlign: "center",
  },

  methodOption: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB",
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  methodIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 14 },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  methodSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "center" },
  trustText: { fontSize: 11, color: "#6B7280" },

  backLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  backLinkText: { color: PRIMARY, fontSize: 14, fontWeight: "600" },
  selectedMethod: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F0F4FF", borderRadius: 10, padding: 10, marginBottom: 10,
  },
  selectedMethodText: { fontSize: 14, fontWeight: "700", color: PRIMARY },

  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 12, marginBottom: 5 },
  input: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    padding: 13, fontSize: 15, color: "#111827", backgroundColor: "#FAFAFA",
  },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginTop: 10,
  },
  errorBoxText: { flex: 1, color: "#EF4444", fontSize: 13 },

  codeBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#F0FDF4", borderRadius: 16, padding: 22, marginVertical: 12,
    borderWidth: 2, borderColor: GREEN,
  },
  codeText: { fontSize: 26, fontWeight: "800", color: "#065F46", letterSpacing: 6 },
  codeHint: { color: "#6B7280", fontSize: 12, textAlign: "center", marginBottom: 14 },
  warningBox: {
    flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FEF3C7",
    borderRadius: 12, padding: 12, gap: 10, marginBottom: 16,
  },
  warningText: { flex: 1, color: "#92400E", fontSize: 13, lineHeight: 18 },

  nudgeTitle: { fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 6 },

  primaryBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  outlineBtn: {
    borderWidth: 2, borderColor: PRIMARY, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", marginTop: 10,
  },
  outlineBtnText: { color: PRIMARY, fontWeight: "700", fontSize: 15 },

  appBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 8,
  },
  appBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  poweredBy: { textAlign: "center", fontSize: 12, color: "#9CA3AF" },
});
