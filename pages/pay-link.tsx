import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Linking, KeyboardAvoidingView,
  Platform, Image, Share,
} from "react-native";

const logoImage = require("../assets/logo.png");
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_BASE, APP_URL } from "../lib/config";
import { getAuthHeader, getCurrentUser } from "../lib/auth";

const NAVY   = "#0F172A";
const BLUE   = "#1D4ED8";
const GREEN  = "#16A34A";
const WA     = "#25D366";
const RED    = "#DC2626";
const MUTED  = "#64748B";
const BORDER = "#E2E8F0";
const SURFACE= "#F8FAFC";

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
  bankDetails?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    branchCode?: string;
  } | null;
  invoice?: {
    customerName: string;
    customerEmail: string | null;
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    dueDate: string | null;
    type: string;
  };
  payments?: Array<{ amount: string; method: string; status: string; createdAt: string }>;
}

type PayMethod = "card" | "wallet" | "eft" | "stitch";
type Step = "choose" | "card-form" | "wallet-form" | "eft-form" | "stitch-form" | "stitch-pending" | "success";

function currencySymbol(code: string) {
  if (code === "ZAR") return "R";
  if (code === "USD") return "$";
  if (code === "GBP") return "£";
  if (code === "EUR") return "€";
  return code + " ";
}

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

  const [cardEmail, setCardEmail] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardPhone, setCardPhone] = useState("");

  const [stitchPayerName, setStitchPayerName] = useState("");
  const [stitchPayerEmail, setStitchPayerEmail] = useState("");
  const [stitchPaymentId, setStitchPaymentId] = useState("");

  const [isPaying, setIsPaying] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (linkId) { fetchLink(); checkAuth(); }
  }, [linkId]);

  const checkAuth = async () => {
    try { setIsLoggedIn(!!(await getCurrentUser())); } catch { setIsLoggedIn(false); }
  };

  const fetchLink = async () => {
    setIsLoading(true); setPageError("");
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
    } finally { setIsLoading(false); }
  };

  const handleWalletPay = async () => {
    if (!linkData) return;
    setInlineError("");
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) { setInlineError("Please enter a valid amount."); return; }
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
      try {
        await fetch(`${API_BASE}/api/payment-links/${linkData.id}/save`, {
          method: "POST", headers: { "Content-Type": "application/json", ...headers },
        });
      } catch {}
      setSuccessMsg(`Payment of ${currencySymbol(linkData.currency)}${parseFloat(amount).toFixed(2)} was successful!`);
      setStep("success");
      fetchLink();
    } catch (e: any) {
      setInlineError(e.message || "Payment failed. Please try again.");
    } finally { setIsPaying(false); }
  };

  const handleStitchPay = async () => {
    if (!linkData) return;
    setInlineError("");
    if (!stitchPayerName.trim()) { setInlineError("Please enter your full name."); return; }
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) { setInlineError("Please enter a valid amount."); return; }
    setIsPaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment-links/${linkData.id}/pay-stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerName: stitchPayerName.trim(), payerEmail: stitchPayerEmail.trim(), amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate payment");
      setStitchPaymentId(data.paymentRequestId);
      if (Platform.OS === "web") {
        window.location.href = data.paymentUrl;
      } else {
        await Linking.openURL(data.paymentUrl);
        setStep("stitch-pending");
      }
    } catch (e: any) {
      setInlineError(e.message || "Could not start payment. Please try again.");
    } finally { setIsPaying(false); }
  };

  const handleStitchVerify = async () => {
    if (!linkData) return;
    setIsPaying(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment-links/${linkData.id}/pay-stitch/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentRequestId: stitchPaymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.status === "completed") {
        setSuccessMsg(`Instant bank payment confirmed!`);
        setStep("success");
        fetchLink();
      } else if (data.status === "failed") {
        setInlineError("Your bank payment was not completed.");
        setStep("stitch-form");
      } else {
        setInlineError("Payment is still processing. Please try again in a moment.");
      }
    } catch (e: any) {
      setInlineError(e.message || "Verification failed.");
      setStep("stitch-form");
    } finally { setIsPaying(false); }
  };

  const handleCardPay = async () => {
    if (!linkData) return;
    setInlineError("");
    if (!cardEmail.trim()) { setInlineError("Please enter your email address."); return; }
    if (!cardName.trim()) { setInlineError("Please enter your full name."); return; }
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) { setInlineError("Please enter a valid amount."); return; }
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
        if (Platform.OS === "web") {
          window.location.href = data.authorizationUrl;
        } else {
          await Linking.openURL(data.authorizationUrl);
          setSuccessMsg("Finish your payment in the browser. It will be confirmed automatically.");
          setStep("success");
        }
      }
    } catch (e: any) {
      setInlineError(e.message || "Could not start payment. Please try again.");
    } finally { setIsPaying(false); }
  };

  const shareViaWhatsApp = async () => {
    if (!linkData) return;
    const url = `${APP_URL}/pay/${linkData.id}`;
    const sym = currencySymbol(linkData.currency);
    const name = linkData.businessName || linkData.senderName || "BukkaPay User";
    const msg = `💳 *Payment Request from ${name}*\n\nAmount: *${sym}${parseFloat(linkData.amount).toFixed(2)}*${linkData.description ? `\nFor: _${linkData.description}_` : ""}\n\nPay securely here:\n${url}\n\n_Powered by BukkaPay — secure payments_`;
    const encoded = encodeURIComponent(msg);
    const waUrl = `whatsapp://send?text=${encoded}`;
    const waWeb = `https://wa.me/?text=${encoded}`;
    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      await Linking.openURL(canOpen ? waUrl : waWeb);
    } catch {
      try { await Share.share({ message: msg, url }); } catch {}
    }
  };

  const notifySenderViaWhatsApp = () => {
    if (!linkData) return;
    const sym = currencySymbol(linkData.currency);
    const amount = isFullPay ? parseFloat(linkData.remainingBalance).toFixed(2) : parseFloat(payAmount || "0").toFixed(2);
    const msg = `Hi ${linkData.businessName || linkData.senderName || "there"} 👋\n\nI've sent *${sym}${amount}* via EFT for "${linkData.description || "your payment request"}".\n\nPlease confirm receipt. 🙏\n\n_Paid via BukkaPay_`;
    const encoded = encodeURIComponent(msg);
    const waUrl = `whatsapp://send?text=${encoded}`;
    Linking.openURL(waUrl).catch(() => Linking.openURL(`https://wa.me/?text=${encoded}`));
  };

  // ─── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.fullCenter}>
        <View style={s.floatCard}>
          <View style={s.loadingLogoWrap}>
            <Image source={logoImage} style={s.loadingLogoImg} resizeMode="cover" />
            <Text style={s.loadingBrand}>BukkaPay</Text>
          </View>
          <ActivityIndicator size="large" color={BLUE} style={{ marginVertical: 20 }} />
          <Text style={s.loadingText}>Loading payment details…</Text>
          <View style={s.sslRow}>
            <Ionicons name="lock-closed" size={12} color={GREEN} />
            <Text style={s.sslText}>256-bit SSL Encryption</Text>
          </View>
        </View>
      </View>
    );
  }

  // ─── Error ──────────────────────────────────────────────────
  if (pageError) {
    return (
      <View style={s.fullCenter}>
        <View style={s.floatCard}>
          <View style={s.errorIconWrap}>
            <Ionicons name="alert-circle" size={52} color={RED} />
          </View>
          <Text style={s.errorTitle}>Link Unavailable</Text>
          <Text style={s.errorText}>{pageError}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={fetchLink}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
        <PoweredByFooter />
      </View>
    );
  }

  if (!linkData) return null;

  const remaining   = parseFloat(linkData.remainingBalance);
  const isPaid      = linkData.status === "paid";
  const progress    = parseFloat(linkData.amount) > 0 ? parseFloat(linkData.amountPaid) / parseFloat(linkData.amount) : 0;
  const displayName = linkData.businessName || linkData.senderName || "BukkaPay User";
  const isBusiness  = linkData.type === "business";
  const sym         = currencySymbol(linkData.currency);
  const payAmtVal   = isFullPay ? remaining : (parseFloat(payAmount) || 0);
  const hasEFT      = !!(linkData.bankDetails?.accountNumber);
  const payUrl      = `${APP_URL}/pay/${linkData.id}`;

  // ─── Fully Paid ──────────────────────────────────────────────
  if (isPaid) {
    return (
      <View style={s.fullCenter}>
        <View style={[s.floatCard, { alignItems: "center" }]}>
          <View style={[s.successCircle, { backgroundColor: GREEN }]}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Fully Settled</Text>
          <Text style={s.successSub}>This payment link has been completely paid.</Text>
        </View>
        <PoweredByFooter />
      </View>
    );
  }

  // ─── Success ─────────────────────────────────────────────────
  if (step === "success") {
    return (
      <View style={s.fullCenter}>
        <View style={[s.floatCard, { alignItems: "center" }]}>
          <View style={[s.successCircle, { backgroundColor: GREEN }]}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Payment Sent!</Text>
          <Text style={s.successSub}>{successMsg}</Text>
          <View style={s.successDivider} />
          <Text style={[s.muted, { textAlign: "center", marginBottom: 20 }]}>
            Thank you for paying {displayName} via BukkaPay.
          </Text>
          <TouchableOpacity style={s.waBtn} onPress={shareViaWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={s.waBtnText}>Share receipt on WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]}
            onPress={() => Linking.openURL("https://app.bukkapay.com")}>
            <Ionicons name="phone-portrait-outline" size={18} color={BLUE} />
            <Text style={s.outlineBtnText}>Open BukkaPay App</Text>
          </TouchableOpacity>
        </View>
        <PoweredByFooter />
      </View>
    );
  }

  // ─── Main ─────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.page} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ── Header bar ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Image source={logoImage} style={s.logoImg} resizeMode="cover" />
            <Text style={s.brandName}>BukkaPay</Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.sslPill}>
              <Ionicons name="lock-closed" size={11} color={GREEN} />
              <Text style={s.sslPillText}>Secure</Text>
            </View>
            <TouchableOpacity style={s.waPillBtn} onPress={shareViaWhatsApp} activeOpacity={0.8}>
              <Ionicons name="logo-whatsapp" size={14} color="#fff" />
              <Text style={s.waPillText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Merchant card ── */}
        <View style={s.merchantCard}>
          {isBusiness && linkData.businessLogo ? (
            <Image source={{ uri: linkData.businessLogo }} style={s.merchantLogo} />
          ) : (
            <View style={[s.merchantAvatar, { backgroundColor: isBusiness ? NAVY : BLUE }]}>
              <Text style={s.merchantInitial}>{(displayName || "B")[0].toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.requestLabel}>Payment request from</Text>
          <Text style={s.merchantName}>{displayName}</Text>
          {isBusiness && (
            <View style={s.bizBadge}>
              <Ionicons name="business" size={11} color={BLUE} />
              <Text style={s.bizBadgeText}>Verified Business</Text>
            </View>
          )}
          <Text style={s.bigAmount}>{sym}{parseFloat(linkData.amount).toFixed(2)}</Text>
          {linkData.currency === "ZAR" && <Text style={s.currencyLabel}>South African Rand</Text>}
          {linkData.description ? <Text style={s.descText}>"{linkData.description}"</Text> : null}

          {linkData.allowPartialPayment && parseFloat(linkData.amountPaid) > 0 && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any }]} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={s.muted}>{sym}{parseFloat(linkData.amountPaid).toFixed(2)} paid</Text>
                <Text style={s.muted}>{Math.round(progress * 100)}% complete</Text>
              </View>
            </View>
          )}

          <View style={s.pillRow}>
            <View style={s.pill}>
              <Text style={s.pillLabel}>Due Now</Text>
              <Text style={[s.pillValue, { color: remaining > 0 ? RED : GREEN }]}>{sym}{remaining.toFixed(2)}</Text>
            </View>
            {linkData.allowPartialPayment && linkData.minimumPayment && (
              <View style={s.pill}>
                <Text style={s.pillLabel}>Minimum</Text>
                <Text style={s.pillValue}>{sym}{parseFloat(linkData.minimumPayment).toFixed(2)}</Text>
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
            <Text style={[s.cardTitle, { fontWeight: "600", fontSize: 14 }]}>{linkData.invoice.customerName}</Text>
            {linkData.invoice.customerEmail ? <Text style={s.muted}>{linkData.invoice.customerEmail}</Text> : null}
            {linkData.invoice.dueDate ? (
              <Text style={s.muted}>Due: {new Date(linkData.invoice.dueDate).toLocaleDateString()}</Text>
            ) : null}
            {linkData.invoice.items?.length > 0 && (
              <View style={s.tableWrap}>
                <View style={[s.tableRow, { borderBottomWidth: 1, borderColor: BORDER, paddingBottom: 6, marginBottom: 4 }]}>
                  <Text style={[s.tableCell, { flex: 2, fontWeight: "700", color: MUTED, fontSize: 12 }]}>Item</Text>
                  <Text style={[s.tableCell, { fontWeight: "700", color: MUTED, fontSize: 12 }]}>Qty</Text>
                  <Text style={[s.tableCell, { textAlign: "right", fontWeight: "700", color: MUTED, fontSize: 12 }]}>Total</Text>
                </View>
                {linkData.invoice.items.map((item, i) => (
                  <View key={i} style={s.tableRow}>
                    <Text style={[s.tableCell, { flex: 2 }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.tableCell}>{item.quantity}</Text>
                    <Text style={[s.tableCell, { textAlign: "right" }]}>{sym}{item.total.toFixed(2)}</Text>
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
                style={[s.toggleBtn, isFullPay && s.toggleBtnActive]}
                onPress={() => { setIsFullPay(true); setPayAmount(remaining.toFixed(2)); }}
              >
                <Text style={[s.toggleTxt, isFullPay && s.toggleTxtActive]}>Full ({sym}{remaining.toFixed(2)})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, !isFullPay && s.toggleBtnActive]}
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
                placeholderTextColor="#94A3B8"
              />
            )}
          </View>
        )}

        {/* ── STEP: Choose method ── */}
        {step === "choose" && (
          <View style={s.card}>
            <Text style={s.cardTitle}>How would you like to pay?</Text>
            <Text style={[s.muted, { marginBottom: 16 }]}>Choose a secure payment method</Text>

            <TouchableOpacity style={s.methodRow} activeOpacity={0.82}
              onPress={() => { setPayMethod("card"); setInlineError(""); setStep("card-form"); }}>
              <View style={[s.methodIcon, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="card" size={24} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.methodTitle}>Debit / Credit Card</Text>
                <Text style={s.methodSub}>Visa · Mastercard · Amex — Powered by Paystack</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity style={s.methodRow} activeOpacity={0.82}
              onPress={() => { setPayMethod("wallet"); setInlineError(""); setStep("wallet-form"); }}>
              <View style={[s.methodIcon, { backgroundColor: "#F0FDF4" }]}>
                <Ionicons name="wallet" size={24} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.methodTitle}>BukkaPay Wallet</Text>
                <Text style={s.methodSub}>Instant · No redirect · Requires account</Text>
              </View>
              <View style={s.instantBadge}>
                <Text style={s.instantText}>Instant</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity style={[s.methodRow, { borderColor: "#EDE9FE" }]} activeOpacity={0.82}
              onPress={() => { setPayMethod("stitch"); setInlineError(""); setStep("stitch-form"); }}>
              <View style={[s.methodIcon, { backgroundColor: "#F5F3FF" }]}>
                <Ionicons name="swap-horizontal" size={24} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.methodTitle}>Instant Bank Pay</Text>
                <Text style={s.methodSub}>Select your bank · Powered by Stitch</Text>
              </View>
              <View style={s.instantBadge}>
                <Text style={s.instantText}>Instant</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>

            {hasEFT && (
              <TouchableOpacity style={s.methodRow} activeOpacity={0.82}
                onPress={() => { setPayMethod("eft"); setInlineError(""); setStep("eft-form"); }}>
                <View style={[s.methodIcon, { backgroundColor: "#FFF7ED" }]}>
                  <Ionicons name="swap-horizontal" size={24} color="#EA580C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.methodTitle}>Manual EFT Transfer</Text>
                  <Text style={s.methodSub}>Internet banking · Confirm via WhatsApp</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[s.methodRow, { borderColor: "#DCFCE7", backgroundColor: "#F0FDF4" }]}
              activeOpacity={0.82} onPress={shareViaWhatsApp}>
              <View style={[s.methodIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="logo-whatsapp" size={24} color={WA} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.methodTitle, { color: "#15803D" }]}>Share on WhatsApp</Text>
                <Text style={s.methodSub}>Send this payment request to someone on WhatsApp</Text>
              </View>
              <Ionicons name="share-outline" size={20} color={WA} />
            </TouchableOpacity>

            <View style={s.trustRow}>
              <Ionicons name="shield-checkmark" size={14} color={GREEN} />
              <Text style={s.trustTxt}>All payments are 256-bit encrypted and secured by BukkaPay</Text>
            </View>
          </View>
        )}

        {/* ── STEP: Card form ── */}
        {step === "card-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backRow}>
              <Ionicons name="arrow-back" size={16} color={BLUE} />
              <Text style={s.backText}>Back</Text>
            </TouchableOpacity>

            <View style={s.selectedMethodBadge}>
              <Ionicons name="card" size={18} color={BLUE} />
              <Text style={s.selectedMethodText}>Card Payment</Text>
            </View>
            <Text style={[s.muted, { marginBottom: 16 }]}>Amount: {sym}{payAmtVal.toFixed(2)}</Text>

            <View style={s.paystackBanner}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ionicons name="lock-closed" size={13} color={BLUE} />
                <Text style={s.paystackBadgeText}>Powered by Paystack</Text>
              </View>
              <Text style={s.paystackNoticeText}>
                You'll be securely redirected to Paystack to enter your card details.
                We never see or store your card information.
              </Text>
            </View>

            <Text style={s.inputLabel}>Full Name *</Text>
            <TextInput style={s.input} value={cardName} onChangeText={setCardName}
              placeholder="e.g. Sipho Nkosi" autoCapitalize="words" placeholderTextColor="#94A3B8" />

            <Text style={s.inputLabel}>Email Address *</Text>
            <TextInput style={s.input} value={cardEmail} onChangeText={setCardEmail}
              placeholder="your@email.com" keyboardType="email-address"
              autoCapitalize="none" placeholderTextColor="#94A3B8" />

            <Text style={s.inputLabel}>Phone Number (optional)</Text>
            <TextInput style={s.input} value={cardPhone} onChangeText={setCardPhone}
              placeholder="+27 000 000 0000" keyboardType="phone-pad" placeholderTextColor="#94A3B8" />

            {!!inlineError && <ErrorBox text={inlineError} />}

            <TouchableOpacity style={[s.primaryBtn, isPaying && { opacity: 0.7 }]}
              onPress={handleCardPay} disabled={isPaying}>
              {isPaying ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="card" size={19} color="#fff" />
                  <Text style={s.primaryBtnText}>Pay {sym}{payAmtVal.toFixed(2)} with Card</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Wallet form ── */}
        {step === "wallet-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backRow}>
              <Ionicons name="arrow-back" size={16} color={BLUE} />
              <Text style={s.backText}>Back</Text>
            </TouchableOpacity>

            <View style={[s.selectedMethodBadge, { backgroundColor: "#F0FDF4", borderColor: "#DCFCE7" }]}>
              <Ionicons name="wallet" size={18} color={GREEN} />
              <Text style={[s.selectedMethodText, { color: GREEN }]}>BukkaPay Wallet</Text>
            </View>

            <View style={s.instantInfoBox}>
              <Ionicons name="flash" size={16} color={GREEN} />
              <Text style={[s.muted, { flex: 1 }]}>Instant transfer — funds arrive immediately, no redirect needed.</Text>
            </View>

            {isLoggedIn ? (
              <>
                <Text style={[s.muted, { marginBottom: 16 }]}>Amount: {sym}{payAmtVal.toFixed(2)}</Text>
                {!!inlineError && <ErrorBox text={inlineError} />}
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: GREEN }, isPaying && { opacity: 0.7 }]}
                  onPress={handleWalletPay} disabled={isPaying}>
                  {isPaying ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="wallet" size={19} color="#fff" />
                      <Text style={s.primaryBtnText}>Pay {sym}{payAmtVal.toFixed(2)} from Wallet</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ alignItems: "center", paddingTop: 8 }}>
                <Ionicons name="person-circle-outline" size={52} color="#CBD5E1" />
                <Text style={[s.cardTitle, { marginTop: 10, textAlign: "center" }]}>Sign in to BukkaPay</Text>
                <Text style={[s.muted, { textAlign: "center", marginBottom: 20 }]}>
                  Log in or create a free account to pay instantly from your wallet.
                </Text>
                <TouchableOpacity style={s.primaryBtn}
                  onPress={() => router.push({ pathname: "/(auth)/login" as any, params: { returnTo: `/pay/${linkId}` } })}>
                  <Ionicons name="log-in-outline" size={19} color="#fff" />
                  <Text style={s.primaryBtnText}>Log In to BukkaPay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.outlineBtn, { marginTop: 10, width: "100%" }]}
                  onPress={() => router.push({ pathname: "/(auth)/signup" as any, params: { returnTo: `/pay/${linkId}` } })}>
                  <Text style={s.outlineBtnText}>Create Free Account</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── STEP: Stitch form ── */}
        {step === "stitch-form" && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backRow}>
              <Ionicons name="arrow-back" size={16} color={BLUE} />
              <Text style={s.backText}>Back</Text>
            </TouchableOpacity>

            <View style={[s.selectedMethodBadge, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Ionicons name="swap-horizontal" size={18} color={BLUE} />
              <Text style={[s.selectedMethodText, { color: BLUE }]}>Instant Bank Pay</Text>
            </View>
            <Text style={[s.muted, { marginBottom: 4 }]}>Amount: {sym}{payAmtVal.toFixed(2)}</Text>

            <View style={s.paystackBanner}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ionicons name="lock-closed" size={13} color={BLUE} />
                <Text style={s.paystackBadgeText}>Powered by Stitch</Text>
              </View>
              <Text style={s.paystackNoticeText}>
                You'll be redirected to your own bank to authorize this payment. No card details required.
              </Text>
            </View>

            <Text style={s.inputLabel}>Full Name *</Text>
            <TextInput style={s.input} value={stitchPayerName} onChangeText={setStitchPayerName}
              placeholder="e.g. Sipho Nkosi" autoCapitalize="words" placeholderTextColor="#94A3B8" />

            <Text style={s.inputLabel}>Email Address (optional)</Text>
            <TextInput style={s.input} value={stitchPayerEmail} onChangeText={setStitchPayerEmail}
              placeholder="your@email.com" keyboardType="email-address"
              autoCapitalize="none" placeholderTextColor="#94A3B8" />

            {!!inlineError && <ErrorBox text={inlineError} />}

            <TouchableOpacity style={[s.primaryBtn, isPaying && { opacity: 0.7 }]}
              onPress={handleStitchPay} disabled={isPaying}>
              {isPaying ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="arrow-forward-circle" size={19} color="#fff" />
                  <Text style={s.primaryBtnText}>Pay {sym}{payAmtVal.toFixed(2)} via Bank</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: Stitch pending ── */}
        {step === "stitch-pending" && (
          <View style={s.card}>
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <Ionicons name="hourglass" size={48} color={BLUE} />
              <Text style={[s.cardTitle, { textAlign: "center", marginTop: 12 }]}>Waiting for Payment</Text>
              <Text style={[s.muted, { textAlign: "center", marginTop: 6, marginBottom: 24 }]}>
                Complete the payment in your browser, then tap below.
              </Text>
            </View>

            {!!inlineError && <ErrorBox text={inlineError} />}

            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: GREEN }, isPaying && { opacity: 0.7 }]}
              onPress={handleStitchVerify} disabled={isPaying}>
              {isPaying ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={19} color="#fff" />
                  <Text style={s.primaryBtnText}>I've Paid — Confirm</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]}
              onPress={() => { setStep("stitch-form"); setInlineError(""); }}>
              <Text style={s.outlineBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP: EFT form ── */}
        {step === "eft-form" && hasEFT && (
          <View style={s.card}>
            <TouchableOpacity onPress={() => { setStep("choose"); setInlineError(""); }} style={s.backRow}>
              <Ionicons name="arrow-back" size={16} color={BLUE} />
              <Text style={s.backText}>Back</Text>
            </TouchableOpacity>

            <View style={[s.selectedMethodBadge, { backgroundColor: "#FFF7ED", borderColor: "#FFEDD5" }]}>
              <Ionicons name="swap-horizontal" size={18} color="#EA580C" />
              <Text style={[s.selectedMethodText, { color: "#EA580C" }]}>EFT Bank Transfer</Text>
            </View>

            <Text style={[s.muted, { marginBottom: 16 }]}>
              Transfer {sym}{payAmtVal.toFixed(2)} to the account below, then confirm via WhatsApp.
            </Text>

            <View style={s.bankDetailsCard}>
              <BankRow label="Bank" value={linkData.bankDetails?.bankName || "—"} />
              <BankRow label="Account Name" value={linkData.bankDetails?.accountName || "—"} />
              <BankRow label="Account Number" value={linkData.bankDetails?.accountNumber || "—"} copyable />
              {linkData.bankDetails?.branchCode ? (
                <BankRow label="Branch Code" value={linkData.bankDetails.branchCode} copyable />
              ) : null}
              <BankRow label="Reference" value={`BKP-${linkData.id.slice(0, 8).toUpperCase()}`} copyable />
              <BankRow label="Amount" value={`${sym}${payAmtVal.toFixed(2)}`} />
            </View>

            <TouchableOpacity style={s.waBtn} onPress={notifySenderViaWhatsApp}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={s.waBtnText}>I've paid — Notify via WhatsApp</Text>
            </TouchableOpacity>

            <Text style={[s.muted, { textAlign: "center", marginTop: 12, fontSize: 12 }]}>
              Your payment will be confirmed once the sender verifies receipt.
            </Text>
          </View>
        )}

        {/* ── Payment history ── */}
        {(linkData.payments || []).filter(p => p.status === "completed").length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment History</Text>
            {(linkData.payments || []).filter(p => p.status === "completed").map((p, i) => (
              <View key={i} style={s.historyRow}>
                <View style={s.historyIcon}><Ionicons name="checkmark" size={14} color={GREEN} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: NAVY }}>{sym}{parseFloat(p.amount).toFixed(2)}</Text>
                  <Text style={s.muted}>{p.method.toUpperCase()} · {new Date(p.createdAt).toLocaleDateString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <PoweredByFooter />
      </ScrollView>

      {/* ── Sticky CTA (choose step) ── */}
      {step === "choose" && (
        <View style={s.stickyBar}>
          <View style={{ flex: 1 }}>
            <Text style={s.stickyLabel}>Amount due</Text>
            <Text style={s.stickyAmount}>{sym}{remaining.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={s.stickyPayBtn} onPress={() => { setStep("card-form"); }}>
            <Ionicons name="card" size={18} color="#fff" />
            <Text style={s.stickyPayText}>Pay Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.stickyWaBtn} onPress={shareViaWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function PoweredByFooter() {
  return (
    <View style={s.footer}>
      <View style={s.footerBadgeRow}>
        <View style={s.footerBadge}>
          <Ionicons name="lock-closed" size={11} color={GREEN} />
          <Text style={s.footerBadgeText}>256-bit SSL</Text>
        </View>
        <View style={s.footerBadge}>
          <Ionicons name="shield-checkmark" size={11} color={GREEN} />
          <Text style={s.footerBadgeText}>PCI DSS Paystack</Text>
        </View>
        <View style={s.footerBadge}>
          <Ionicons name="checkmark-circle" size={11} color={GREEN} />
          <Text style={s.footerBadgeText}>BukkaPay Verified</Text>
        </View>
      </View>
      <Text style={s.footerText}>🔒 Powered by BukkaPay · Secure Payments</Text>
    </View>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={s.errorBox}>
      <Ionicons name="alert-circle" size={16} color={RED} />
      <Text style={s.errorBoxText}>{text}</Text>
    </View>
  );
}

function BankRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const handleCopy = async () => {
    if (Platform.OS === "web") {
      (navigator as any).clipboard?.writeText(value).catch(() => {});
    } else {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(value);
    }
  };
  return (
    <View style={s.bankRow}>
      <Text style={s.bankLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={s.bankValue}>{value}</Text>
        {copyable && (
          <TouchableOpacity onPress={handleCopy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="copy-outline" size={14} color={MUTED} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F3FF" },
  fullCenter: { flex: 1, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", padding: 20 },
  floatCard: {
    backgroundColor: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 440,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 8,
  },

  loadingLogoWrap: { alignItems: "center", marginBottom: 4 },
  loadingLogo: { width: 56, height: 56, borderRadius: 16, backgroundColor: NAVY, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  loadingLogoText: { color: "#fff", fontWeight: "900", fontSize: 26 },
  loadingBrand: { fontWeight: "800", fontSize: 20, color: NAVY },
  loadingText: { color: MUTED, textAlign: "center", marginTop: 4 },
  sslRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, justifyContent: "center" },
  sslText: { fontSize: 12, color: GREEN, fontWeight: "600" },

  errorIconWrap: { alignItems: "center", marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: "700", color: NAVY, textAlign: "center", marginBottom: 8 },
  errorText: { color: MUTED, textAlign: "center", fontSize: 14, lineHeight: 20, marginBottom: 20 },

  successCircle: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 16, alignSelf: "center" },
  successTitle: { fontSize: 26, fontWeight: "800", color: NAVY, textAlign: "center", marginBottom: 8 },
  successSub: { color: MUTED, textAlign: "center", fontSize: 15, lineHeight: 22, marginBottom: 4 },
  successDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 20, width: "100%" },

  header: {
    backgroundColor: "#7C3AED", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 16,
    paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoImg: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff" },
  loadingLogoImg: { width: 56, height: 56, borderRadius: 16, marginBottom: 8 },
  brandName: { color: "#fff", fontSize: 20, fontWeight: "800" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  sslPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  sslPillText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  waPillBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: WA, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  waPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  merchantCard: {
    margin: 16, backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center",
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6,
    borderWidth: 1, borderColor: "#EDE9FE",
  },
  merchantLogo: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 2, borderColor: "#E0E7FF" },
  merchantAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  merchantInitial: { color: "#fff", fontSize: 30, fontWeight: "800" },
  requestLabel: { fontSize: 12, color: MUTED, marginBottom: 2 },
  merchantName: { fontSize: 20, fontWeight: "800", color: NAVY, marginBottom: 4 },
  bizBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 12 },
  bizBadgeText: { fontSize: 11, fontWeight: "700", color: BLUE },
  bigAmount: { fontSize: 46, fontWeight: "900", color: NAVY, marginTop: 8 },
  currencyLabel: { fontSize: 12, color: MUTED, marginTop: 2 },
  descText: { color: MUTED, fontSize: 14, fontStyle: "italic", marginTop: 8, textAlign: "center" },
  progressWrap: { width: "100%", marginTop: 18 },
  progressTrack: { height: 8, backgroundColor: "#F1F5F9", borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: BLUE, borderRadius: 4 },
  pillRow: { flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  pill: { flex: 1, backgroundColor: "#F8FAFC", borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, borderColor: BORDER },
  pillLabel: { fontSize: 11, color: MUTED, fontWeight: "600", marginBottom: 2 },
  pillValue: { fontSize: 18, fontWeight: "800", color: NAVY },

  card: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: "#fff", borderRadius: 20, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: NAVY, marginBottom: 6 },
  muted: { color: MUTED, fontSize: 13 },
  tableWrap: { marginTop: 12 },
  tableRow: { flexDirection: "row", paddingVertical: 6 },
  tableCell: { flex: 1, fontSize: 13, color: "#374151" },

  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, alignItems: "center" },
  toggleBtnActive: { borderColor: BLUE, backgroundColor: "#EFF6FF" },
  toggleTxt: { fontSize: 13, fontWeight: "600", color: MUTED },
  toggleTxtActive: { color: BLUE },

  methodRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 16, padding: 16, marginBottom: 10, gap: 14,
  },
  methodIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  methodTitle: { fontSize: 16, fontWeight: "700", color: NAVY },
  methodSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  instantBadge: { backgroundColor: "#DCFCE7", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  instantText: { fontSize: 11, fontWeight: "700", color: GREEN },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "center" },
  trustTxt: { fontSize: 11, color: MUTED, textAlign: "center", flex: 1 },

  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { color: BLUE, fontWeight: "600", fontSize: 14 },
  selectedMethodBadge: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF",
    borderRadius: 12, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: "#BFDBFE",
  },
  selectedMethodText: { fontSize: 15, fontWeight: "700", color: BLUE },

  paystackBanner: { backgroundColor: "#EFF6FF", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#BFDBFE" },
  paystackBadgeText: { fontSize: 12, fontWeight: "700", color: BLUE },
  paystackNoticeText: { fontSize: 13, color: "#1E40AF", lineHeight: 19 },

  instantInfoBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0FDF4", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#DCFCE7" },

  bankDetailsCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: BORDER },
  bankRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: BORDER },
  bankLabel: { fontSize: 12, color: MUTED, fontWeight: "600" },
  bankValue: { fontSize: 14, fontWeight: "700", color: NAVY },

  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14,
    fontSize: 15, color: NAVY, backgroundColor: SURFACE,
  },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginTop: 12 },
  errorBoxText: { flex: 1, color: RED, fontSize: 13 },

  primaryBtn: {
    backgroundColor: "#7C3AED", borderRadius: 16, paddingVertical: 17,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20,
    shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  outlineBtn: { borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  outlineBtnText: { color: "#7C3AED", fontWeight: "700", fontSize: 15 },
  waBtn: {
    backgroundColor: WA, borderRadius: 16, paddingVertical: 17,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4,
    shadowColor: WA, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  waBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#F8FAFC" },
  historyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },

  stickyBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1, borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    flexDirection: "row", alignItems: "center", gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  stickyLabel: { fontSize: 11, color: MUTED, fontWeight: "600" },
  stickyAmount: { fontSize: 20, fontWeight: "900", color: NAVY },
  stickyPayBtn: {
    flex: 1, backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  stickyPayText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  stickyWaBtn: { width: 50, height: 50, backgroundColor: WA, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  footer: { marginTop: 24, marginBottom: 16, paddingHorizontal: 16, alignItems: "center", gap: 10 },
  footerBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  footerBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FDF4", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#DCFCE7" },
  footerBadgeText: { fontSize: 11, color: GREEN, fontWeight: "600" },
  footerText: { fontSize: 12, color: MUTED, textAlign: "center" },
});
