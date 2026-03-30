import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Linking, KeyboardAvoidingView,
  Platform, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_BASE } from "../lib/config";
import { getAuthHeader, getCurrentUser } from "../lib/auth";

const PRIMARY = "#001A72";
const ACCENT = "#4F8EF7";
const GREEN = "#10B981";
const BG = "#F0F4FF";

interface PaymentLinkData {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  status: string;
  amountPaid: string;
  remainingBalance: string;
  allowPartialPayment: boolean;
  minimumPayment: string | null;
  type: string;
  region: string;
  destination: string;
  senderName: string;
  businessName: string | null;
  businessLogo: string | null;
  paymentUrl: string;
  invoice?: {
    customerName: string;
    customerEmail: string | null;
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    dueDate: string | null;
    type: string;
  };
  payments?: Array<{ amount: string; method: string; status: string; createdAt: string }>;
}

type PayMethod = "card" | "wallet";
type Step = "choose" | "card-form" | "wallet-form" | "success";

export default function PayLink() {
  const router = useRouter();
  const { linkId } = useLocalSearchParams<{ linkId: string }>();

  const [linkData, setLinkData] = useState<PaymentLinkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [step, setStep] = useState<Step>("choose");
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [payAmount, setPayAmount] = useState("");
  const [isFullPay, setIsFullPay] = useState(true);

  // Card fields
  const [cardEmail, setCardEmail] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardPhone, setCardPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const [isPaying, setIsPaying] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (linkId) {
      fetchLink();
      checkAuth();
    }
  }, [linkId]);

  const checkAuth = async () => {
    try {
      const user = await getCurrentUser();
      setIsLoggedIn(!!user);
    } catch {
      setIsLoggedIn(false);
    }
  };

  const fetchLink = async () => {
    setIsLoading(true);
    setPageError("");
    try {
      const res = await fetch(`${API_BASE}/api/payment-links/${linkId}`);
      if (res.ok) {
        const data = await res.json();
        setLinkData(data);
        setPayAmount(data.remainingBalance);
        if (data.invoice?.customerName) setCardName(data.invoice.customerName);
        if (data.invoice?.customerEmail) setCardEmail(data.invoice.customerEmail);
      } else {
        const d = await res.json();
        setPageError(d.error || "Payment link not found");
      }
    } catch {
      setPageError("Network error — please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCardNumber = (val: string) =>
    val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleWalletPay = async () => {
    if (!linkData) return;
    setInlineError("");
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) {
      setInlineError("Please enter a valid payment amount."); return;
    }
    setIsPaying(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links/${linkData.id}/pay-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      // Save to received links after successful wallet payment
      try {
        await fetch(`${API_BASE}/api/payment-links/${linkData.id}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
        });
      } catch {}
      setSuccessMsg(`Payment of ${linkData.currency} ${parseFloat(amount).toFixed(2)} was successful!`);
      setStep("success");
      fetchLink();
    } catch (e: any) {
      setInlineError(e.message || "Payment failed. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  const handleCardPay = async () => {
    if (!linkData) return;
    setInlineError("");
    if (!cardEmail.trim()) { setInlineError("Please enter your email address."); return; }
    if (!cardName.trim()) { setInlineError("Please enter your full name."); return; }
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) {
      setInlineError("Please enter a valid payment amount."); return;
    }
    setIsPaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment-links/${linkData.id}/pay-card/initialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cardEmail.trim(), amount, payerName: cardName.trim(), payerPhone: cardPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Card payment initialization failed");
      if (data.authorizationUrl) {
        await Linking.openURL(data.authorizationUrl);
        setSuccessMsg("Finish your card payment in the browser window that just opened. Your payment will be confirmed automatically.");
        setStep("success");
      }
    } catch (e: any) {
      setInlineError(e.message || "Could not start card payment. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  // ─── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.fullCenter}>
        <View style={s.loadingCard}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={s.loadingText}>Loading payment details…</Text>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ─── Error / not found ──────────────────────────────────────
  if (pageError) {
    return (
      <View style={s.fullCenter}>
        <View style={s.errorCard}>
          <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
          <Text style={s.errorTitle}>Link Unavailable</Text>
          <Text style={s.errorText}>{pageError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchLink}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  if (!linkData) return null;

  const remaining = parseFloat(linkData.remainingBalance);
  const isPaid = linkData.status === "paid";
  const progress = parseFloat(linkData.amount) > 0
    ? parseFloat(linkData.amountPaid) / parseFloat(linkData.amount) : 0;
  const displayName = linkData.businessName || linkData.senderName || "BukkaPay User";
  const isBusiness = linkData.type === "business";
  const payAmountValue = isFullPay ? remaining : (parseFloat(payAmount) || 0);
  const currSym = linkData.currency === "ZAR" ? "R" : linkData.currency;

  // ─── Success ────────────────────────────────────────────────
  if (step === "success") {
    return (
      <View style={s.fullCenter}>
        <View style={s.successCard}>
          <View style={s.successCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Payment Sent!</Text>
          <Text style={s.successMsg}>{successMsg}</Text>
          <View style={s.successDivider} />
          <Text style={s.successSub}>Thank you for paying {displayName} via BukkaPay.</Text>
          <TouchableOpacity style={s.downloadAppBtn} onPress={() => Linking.openURL("https://bukkapay-expo.vercel.app")}>
            <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
            <Text style={s.downloadAppBtnText}>Open BukkaPay App</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ─── Paid banner ────────────────────────────────────────────
  if (isPaid) {
    return (
      <View style={s.fullCenter}>
        <View style={s.successCard}>
          <Ionicons name="checkmark-circle" size={64} color={GREEN} />
          <Text style={s.successTitle}>Fully Paid</Text>
          <Text style={s.successMsg}>This payment link has been completely settled.</Text>
        </View>
        <Text style={s.poweredBy}>Secured by BukkaPay</Text>
      </View>
    );
  }

  // ─── Main payment page ──────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.page} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

        {/* ── BukkaPay Header ── */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View style={s.logoIcon}>
              <Text style={s.logoIconText}>B</Text>
            </View>
            <Text style={s.logoText}>BukkaPay</Text>
          </View>
          <View style={s.securedBadge}>
            <Ionicons name="lock-closed" size={11} color="#10B981" />
            <Text style={s.securedText}>Secure Payment</Text>
          </View>
        </View>

        {/* ── Who is requesting ── */}
        <View style={s.senderCard}>
          {isBusiness && linkData.businessLogo ? (
            <Image source={{ uri: linkData.businessLogo }} style={s.senderLogo} />
          ) : (
            <View style={[s.senderAvatar, isBusiness && { backgroundColor: "#1E3A8A" }]}>
              <Text style={s.senderInitial}>{(displayName || "B")[0].toUpperCase()}</Text>
            </View>
          )}

          <Text style={s.requestingLabel}>Payment request from</Text>
          <Text style={s.senderName}>{displayName}</Text>
          {isBusiness && (
            <View style={s.businessBadge}>
              <Ionicons name="business" size={11} color={PRIMARY} />
              <Text style={s.businessBadgeText}>Business</Text>
            </View>
          )}

          <Text style={s.amountBig}>{currSym} {parseFloat(linkData.amount).toFixed(2)}</Text>
          {linkData.currency === "ZAR" && <Text style={s.currencyLabel}>South African Rand</Text>}
          {linkData.description ? <Text style={s.description}>"{linkData.description}"</Text> : null}

          {/* Partial payment progress */}
          {linkData.allowPartialPayment && parseFloat(linkData.amountPaid) > 0 && (
            <View style={s.progressWrap}>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any }]} />
              </View>
              <View style={s.progressRow}>
                <Text style={s.progressTxt}>{currSym} {parseFloat(linkData.amountPaid).toFixed(2)} paid</Text>
                <Text style={s.progressTxt}>{Math.round(progress * 100)}% complete</Text>
              </View>
            </View>
          )}

          {/* Remaining pill */}
          <View style={s.pillsRow}>
            <View style={s.pill}>
              <Text style={s.pillLabel}>Amount Due</Text>
              <Text style={[s.pillValue, { color: remaining > 0 ? "#EF4444" : GREEN }]}>
                {currSym} {remaining.toFixed(2)}
              </Text>
            </View>
            {linkData.allowPartialPayment && linkData.minimumPayment && (
              <View style={s.pill}>
                <Text style={s.pillLabel}>Minimum</Text>
                <Text style={s.pillValue}>{currSym} {parseFloat(linkData.minimumPayment).toFixed(2)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Invoice details ── */}
        {linkData.invoice && (
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {linkData.invoice.type === "quotation" ? "Quotation" : "Invoice"} Details
            </Text>
            <Text style={s.invoiceCustomer}>{linkData.invoice.customerName}</Text>
            {linkData.invoice.customerEmail ? <Text style={s.invoiceMeta}>{linkData.invoice.customerEmail}</Text> : null}
            {linkData.invoice.dueDate ? (
              <Text style={s.invoiceMeta}>Due: {new Date(linkData.invoice.dueDate).toLocaleDateString()}</Text>
            ) : null}
            {linkData.invoice.items?.length > 0 && (
              <View style={s.tableWrap}>
                <View style={s.tableHead}>
                  <Text style={[s.tableHeadTxt, { flex: 2 }]}>Item</Text>
                  <Text style={s.tableHeadTxt}>Qty</Text>
                  <Text style={[s.tableHeadTxt, { textAlign: "right" }]}>Total</Text>
                </View>
                {linkData.invoice.items.map((item, i) => (
                  <View key={i} style={s.tableRow}>
                    <Text style={[s.tableCell, { flex: 2 }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.tableCell}>{item.quantity}</Text>
                    <Text style={[s.tableCell, { textAlign: "right" }]}>{currSym} {item.total.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Partial amount selector ── */}
        {linkData.allowPartialPayment && step === "choose" && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment Amount</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggle, isFullPay && s.toggleActive]}
                onPress={() => { setIsFullPay(true); setPayAmount(remaining.toFixed(2)); }}
              >
                <Text style={[s.toggleTxt, isFullPay && s.toggleTxtActive]}>
                  Full ({currSym} {remaining.toFixed(2)})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggle, !isFullPay && s.toggleActive]}
                onPress={() => setIsFullPay(false)}
              >
                <Text style={[s.toggleTxt, !isFullPay && s.toggleTxtActive]}>Custom Amount</Text>
              </TouchableOpacity>
            </View>
            {!isFullPay && (
              <TextInput
                style={s.input}
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder={`Min: ${linkData.minimumPayment || "any amount"}`}
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
            )}
          </View>
        )}

        {/* ── STEP: Choose method ── */}
        {step === "choose" && (
          <View style={s.card}>
            <Text style={s.cardTitle}>How would you like to pay?</Text>
            <Text style={s.cardSub}>Choose a payment method below</Text>

            {/* Card option */}
            <TouchableOpacity
              style={s.methodOption}
              onPress={() => { setPayMethod("card"); setInlineError(""); setStep("card-form"); }}
              activeOpacity={0.85}
            >
              <View style={[s.methodIcon, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="card" size={26} color="#2563EB" />
              </View>
              <View style={s.methodInfo}>
                <Text style={s.methodTitle}>Debit / Credit Card</Text>
                <Text style={s.methodSub}>Visa, Mastercard, American Express</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Wallet option */}
            <TouchableOpacity
              style={s.methodOption}
              onPress={() => { setPayMethod("wallet"); setInlineError(""); setStep("wallet-form"); }}
              activeOpacity={0.85}
            >
              <View style={[s.methodIcon, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="wallet" size={26} color={GREEN} />
              </View>
              <View style={s.methodInfo}>
                <Text style={s.methodTitle}>BukkaPay Wallet</Text>
                <Text style={s.methodSub}>Instant · Requires BukkaPay account</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={s.trustRow}>
              <Ionicons name="shield-checkmark" size={14} color={GREEN} />
              <Text style={s.trustTxt}>All payments are encrypted and secured by BukkaPay</Text>
            </View>
          </View>
        )}

        {/* ── STEP: Card form ── */}
        {step === "card-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backLink}>
              <Ionicons name="arrow-back" size={16} color={PRIMARY} />
              <Text style={s.backLinkTxt}>Back to payment methods</Text>
            </TouchableOpacity>

            <View style={s.selectedMethod}>
              <Ionicons name="card" size={20} color="#2563EB" />
              <Text style={s.selectedMethodTxt}>Paying by Card</Text>
            </View>
            <Text style={s.amountDueTxt}>
              Amount: {currSym} {payAmountValue.toFixed(2)}
            </Text>

            <Text style={[s.cardTitle, { marginTop: 16 }]}>Card Details</Text>

            <Text style={s.inputLabel}>Card Number *</Text>
            <View style={s.cardInputRow}>
              <Ionicons name="card-outline" size={18} color="#6B7280" style={s.inputIcon} />
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                value={cardNumber}
                onChangeText={v => setCardNumber(formatCardNumber(v))}
                placeholder="1234 5678 9012 3456"
                keyboardType="numeric"
                maxLength={19}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={s.cardRowFields}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Expiry *</Text>
                <TextInput
                  style={s.input}
                  value={cardExpiry}
                  onChangeText={v => setCardExpiry(formatExpiry(v))}
                  placeholder="MM/YY"
                  keyboardType="numeric"
                  maxLength={5}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>CVC *</Text>
                <TextInput
                  style={s.input}
                  value={cardCvc}
                  onChangeText={v => setCardCvc(v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="123"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            <Text style={[s.cardTitle, { marginTop: 16 }]}>Your Details</Text>

            <Text style={s.inputLabel}>Full Name *</Text>
            <TextInput
              style={s.input} value={cardName} onChangeText={setCardName}
              placeholder="e.g. John Doe" autoCapitalize="words" placeholderTextColor="#9CA3AF"
            />

            <Text style={s.inputLabel}>Email Address *</Text>
            <TextInput
              style={s.input} value={cardEmail} onChangeText={setCardEmail}
              placeholder="your@email.com" keyboardType="email-address"
              autoCapitalize="none" placeholderTextColor="#9CA3AF"
            />

            <Text style={s.inputLabel}>Phone Number (optional)</Text>
            <TextInput
              style={s.input} value={cardPhone} onChangeText={setCardPhone}
              placeholder="+27 000 000 0000" keyboardType="phone-pad" placeholderTextColor="#9CA3AF"
            />

            {inlineError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={s.errorBoxTxt}>{inlineError}</Text>
              </View>
            ) : null}

            <View style={s.secureNote}>
              <Ionicons name="lock-closed" size={13} color="#6B7280" />
              <Text style={s.secureNoteTxt}>Your payment is processed securely via Paystack — we never store your card details.</Text>
            </View>

            <TouchableOpacity
              style={[s.payBtn, isPaying && { opacity: 0.7 }]}
              onPress={handleCardPay} disabled={isPaying}
            >
              {isPaying ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="card" size={20} color="#fff" />
                  <Text style={s.payBtnTxt}>Pay {currSym} {payAmountValue.toFixed(2)} with Card</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Wallet form ── */}
        {step === "wallet-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backLink}>
              <Ionicons name="arrow-back" size={16} color={PRIMARY} />
              <Text style={s.backLinkTxt}>Back to payment methods</Text>
            </TouchableOpacity>

            <View style={s.selectedMethod}>
              <Ionicons name="wallet" size={20} color={GREEN} />
              <Text style={s.selectedMethodTxt}>Paying with BukkaPay Wallet</Text>
            </View>
            <Text style={s.amountDueTxt}>
              Amount: {currSym} {payAmountValue.toFixed(2)}
            </Text>

            {isLoggedIn ? (
              <>
                {inlineError ? (
                  <View style={s.errorBox}>
                    <Ionicons name="alert-circle" size={16} color="#EF4444" />
                    <Text style={s.errorBoxTxt}>{inlineError}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[s.payBtn, isPaying && { opacity: 0.7 }, { backgroundColor: GREEN }]}
                  onPress={handleWalletPay} disabled={isPaying}
                >
                  {isPaying ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="wallet" size={20} color="#fff" />
                      <Text style={s.payBtnTxt}>Pay {currSym} {payAmountValue.toFixed(2)} from Wallet</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={s.walletNudge}>
                <Ionicons name="wallet-outline" size={40} color={PRIMARY} />
                <Text style={s.nudgeTitle}>BukkaPay Account Required</Text>
                <Text style={s.nudgeSub}>
                  To pay from your BukkaPay wallet, log in or create a free account — it takes under a minute.
                </Text>
                <TouchableOpacity style={[s.payBtn, { marginTop: 8 }]}
                  onPress={() => router.push({ pathname: "/(auth)/login" as any, params: { returnTo: `/pay/${linkId}` } })}>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={s.payBtnTxt}>Log In to BukkaPay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.outlineBtn}
                  onPress={() => router.push({ pathname: "/(auth)/signup" as any, params: { returnTo: `/pay/${linkId}` } })}>
                  <Text style={s.outlineBtnTxt}>Create Free Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Payment history ── */}
        {linkData.payments && linkData.payments.filter(p => p.status === "completed").length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment History</Text>
            {linkData.payments.filter(p => p.status === "completed").map((p, i) => (
              <View key={i} style={s.historyRow}>
                <View style={s.historyIcon}>
                  <Ionicons name="checkmark" size={14} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyAmt}>{currSym} {parseFloat(p.amount).toFixed(2)}</Text>
                  <Text style={s.historyMeta}>{p.method.toUpperCase()} · {new Date(p.createdAt).toLocaleDateString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={[s.poweredBy, { marginTop: 32 }]}>🔒 Secured by BukkaPay</Text>

      </ScrollView>

      {/* ── Sticky Pay button (choose step only on mobile) ── */}
      {step === "choose" && Platform.OS !== "web" && (
        <View style={s.stickyFooter}>
          <TouchableOpacity style={s.payBtn} onPress={() => setStep("card-form")}>
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={s.payBtnTxt}>Pay {currSym} {payAmountValue.toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  fullCenter: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 24 },

  loadingCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 40, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
  },
  loadingText: { marginTop: 14, color: "#6B7280", fontSize: 15 },

  errorCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 32, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 12, elevation: 3, maxWidth: 360, width: "100%",
  },
  errorTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 12 },
  errorText: { color: "#6B7280", textAlign: "center", marginTop: 6, fontSize: 14, lineHeight: 20 },
  retryBtn: {
    marginTop: 20, backgroundColor: PRIMARY, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  successCard: {
    backgroundColor: "#fff", borderRadius: 24, padding: 36, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 16, elevation: 4, maxWidth: 380, width: "100%",
  },
  successCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: GREEN,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  successTitle: { fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 8 },
  successMsg: { color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22 },
  successDivider: { width: "80%", height: 1, backgroundColor: "#F3F4F6", marginVertical: 20 },
  successSub: { color: "#9CA3AF", textAlign: "center", fontSize: 13 },
  downloadAppBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 20,
  },
  downloadAppBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  header: {
    backgroundColor: PRIMARY, paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 18,
    paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  logoIconText: { color: PRIMARY, fontSize: 18, fontWeight: "900" },
  logoText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  securedBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  securedText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  senderCard: {
    margin: 16, backgroundColor: "#fff", borderRadius: 24, padding: 24,
    alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 5,
  },
  senderLogo: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 2, borderColor: "#E0E7FF" },
  senderAvatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  senderInitial: { color: "#fff", fontSize: 30, fontWeight: "800" },
  requestingLabel: { fontSize: 12, color: "#9CA3AF", marginBottom: 2 },
  senderName: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },
  businessBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 12,
  },
  businessBadgeText: { fontSize: 11, fontWeight: "700", color: PRIMARY },
  amountBig: { fontSize: 44, fontWeight: "900", color: PRIMARY, marginTop: 8 },
  currencyLabel: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  description: { color: "#6B7280", fontSize: 14, fontStyle: "italic", marginTop: 8, textAlign: "center" },
  progressWrap: { width: "100%", marginTop: 18 },
  progressBar: { height: 8, backgroundColor: "#F3F4F6", borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: PRIMARY, borderRadius: 4 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  progressTxt: { fontSize: 11, color: "#9CA3AF" },
  pillsRow: { flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  pill: { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 14, padding: 12, alignItems: "center" },
  pillLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "600", marginBottom: 2 },
  pillValue: { fontSize: 16, fontWeight: "800", color: "#111827" },

  card: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: "#fff",
    borderRadius: 20, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 6 },
  cardSub: { fontSize: 13, color: "#6B7280", marginBottom: 14 },

  invoiceCustomer: { fontSize: 15, fontWeight: "700", color: "#111827" },
  invoiceMeta: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  tableWrap: { borderTopWidth: 1, borderColor: "#F3F4F6", marginTop: 12, paddingTop: 10 },
  tableHead: { flexDirection: "row", marginBottom: 6 },
  tableHeadTxt: { flex: 1, fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
  tableRow: { flexDirection: "row", paddingVertical: 5 },
  tableCell: { flex: 1, fontSize: 13, color: "#374151" },

  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: "#E5E7EB", alignItems: "center" },
  toggleActive: { borderColor: PRIMARY, backgroundColor: "#EEF2FF" },
  toggleTxt: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  toggleTxtActive: { color: PRIMARY },

  methodOption: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB",
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  methodIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 14 },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  methodSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "center" },
  trustTxt: { fontSize: 11, color: "#6B7280" },

  backLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backLinkTxt: { color: PRIMARY, fontSize: 14, fontWeight: "600" },
  selectedMethod: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F0F4FF", borderRadius: 10, padding: 10, marginBottom: 4,
  },
  selectedMethodTxt: { fontSize: 14, fontWeight: "700", color: PRIMARY },
  amountDueTxt: { fontSize: 13, color: "#6B7280", marginBottom: 16 },

  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 12, marginBottom: 5 },
  input: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    padding: 13, fontSize: 15, color: "#111827", backgroundColor: "#FAFAFA",
  },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginTop: 12,
  },
  errorBoxTxt: { flex: 1, color: "#EF4444", fontSize: 13 },

  secureNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, marginTop: 14,
  },
  secureNoteTxt: { flex: 1, fontSize: 12, color: "#6B7280", lineHeight: 18 },

  cardInputRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5,
    borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12,
    marginBottom: 12, backgroundColor: "#fff",
  },
  inputIcon: { marginRight: 6 },
  cardRowFields: { flexDirection: "row", gap: 10 },
  walletNudge: { alignItems: "center", paddingTop: 12 },
  nudgeTitle: { fontSize: 17, fontWeight: "800", color: "#111827", marginTop: 12, marginBottom: 6 },
  nudgeSub: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 8 },
  outlineBtn: {
    borderWidth: 2, borderColor: PRIMARY, borderRadius: 14, paddingVertical: 14,
    alignItems: "center", marginTop: 10, width: "100%",
  },
  outlineBtnTxt: { color: PRIMARY, fontWeight: "700", fontSize: 15 },

  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderColor: "#F9FAFB",
  },
  historyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  historyAmt: { fontSize: 14, fontWeight: "700", color: "#111827" },
  historyMeta: { fontSize: 12, color: "#9CA3AF" },

  payBtn: {
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 17,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  payBtnTxt: { color: "#fff", fontSize: 17, fontWeight: "800" },

  stickyFooter: {
    paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 36 : 20, paddingTop: 12,
    backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#F3F4F6",
  },
  poweredBy: { textAlign: "center", fontSize: 12, color: "#9CA3AF" },
});
