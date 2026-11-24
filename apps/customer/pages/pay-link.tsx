import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Linking, KeyboardAvoidingView,
  Platform, Image, Share,
} from "react-native";

const logoImage = require("../assets/logo.png");
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { API_BASE, APP_URL, payUrl as publicPayUrl } from "../lib/config";
import { getAuthHeader, getCurrentUser } from "../lib/auth";
import PinPrompt from "../components/PinPrompt";

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
  invoice?: {
    customerName: string;
    customerEmail: string | null;
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    dueDate: string | null;
    type: string;
    attachment?: { name: string; data: string; mimeType: string; sizeKB: number } | null;
  };
  payments?: Array<{ amount: string; method: string; status: string; createdAt: string }>;
}

type PayMethod = "wallet" | "stitch";
type Step = "choose" | "wallet-form" | "stitch-form" | "stitch-pending" | "success";

function currencySymbol(code: string) {
  if (code === "ZAR") return "R";
  if (code === "USD") return "$";
  if (code === "GBP") return "£";
  if (code === "EUR") return "€";
  return code + " ";
}

export default function PayLink() {
  const router = useRouter();
  const { linkId, amount: chosenAmount } = useLocalSearchParams<{ linkId: string; amount?: string }>();

  const [linkData, setLinkData] = useState<PaymentLinkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [step, setStep] = useState<Step>("choose");
  const [payMethod, setPayMethod] = useState<PayMethod>("wallet");
  const [payAmount, setPayAmount] = useState("");
  const [isFullPay, setIsFullPay] = useState(true);

  const [stitchPayerName, setStitchPayerName] = useState("");
  const [stitchPayerEmail, setStitchPayerEmail] = useState("");
  const [stitchPaymentId, setStitchPaymentId] = useState("");

  const [isPaying, setIsPaying] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");

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
        // Amount chosen on pay.bukkapay.com (part-payment), if any and valid.
        const chosen = Number(chosenAmount);
        if (data.allowPartialPayment && chosen > 0 && chosen < Number(data.remainingBalance)) {
          setIsFullPay(false);
          setPayAmount(chosen.toFixed(2));
        } else {
          setPayAmount(data.remainingBalance);
        }
        if (data.invoice?.customerName) setStitchPayerName(data.invoice.customerName);
        if (data.invoice?.customerEmail) setStitchPayerEmail(data.invoice.customerEmail);
      } else {
        const d = await res.json();
        setPageError(d.error || "Payment link not found");
      }
    } catch {
      setPageError("Network error — please check your connection and try again.");
    } finally { setIsLoading(false); }
  };

  const handleWalletPay = () => {
    if (!linkData) return;
    setInlineError("");
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    if (!amount || parseFloat(amount) <= 0) { setInlineError("Please enter a valid amount."); return; }
    setShowPinPrompt(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (!linkData) return;
    const amount = isFullPay ? linkData.remainingBalance : payAmount;
    setIsPaying(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/payment-links/${linkData.id}/pay-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ amount, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      try {
        await fetch(`${API_BASE}/api/payment-links/${linkData.id}/save`, {
          method: "POST", headers: { "Content-Type": "application/json", ...headers },
        });
      } catch {}
      setShowPinPrompt(false);
      setPaidAmount(amount);
      setSuccessMsg(`Payment of ${currencySymbol(linkData.currency)}${parseFloat(amount).toFixed(2)} was successful!`);
      setStep("success");
      fetchLink();
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
        setPaidAmount(isFullPay ? linkData.remainingBalance : payAmount);
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


  const shareProofOfPayment = async (paidAmount: string) => {
    if (!linkData) return;
    const sym = currencySymbol(linkData.currency);
    const name = linkData.businessName || linkData.senderName || "BukkaPay User";
    const reference = `BKP-${linkData.id.slice(0, 8).toUpperCase()}`;
    const date = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
    const msg = `✅ *Payment Confirmation*\n\nI've paid ${name} *${sym}${parseFloat(paidAmount).toFixed(2)}* via BukkaPay${linkData.description ? ` for "${linkData.description}"` : ""}.\n\nReference: ${reference}\nDate: ${date}\n\n_Paid via BukkaPay — secure payments_`;
    const encoded = encodeURIComponent(msg);
    const waUrl = `whatsapp://send?text=${encoded}`;
    const waWeb = `https://wa.me/?text=${encoded}`;
    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      await Linking.openURL(canOpen ? waUrl : waWeb);
    } catch {
      try { await Share.share({ message: msg }); } catch {}
    }
  };

  const handleViewAttachment = async () => {
    const attachment = linkData?.invoice?.attachment;
    if (!attachment) return;
    const mimeType = attachment.mimeType || "application/pdf";
    if (Platform.OS === "web") {
      const byteChars = atob(attachment.data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      return;
    }
    // A raw data: URI isn't something iOS/Android know how to hand off to a
    // viewer app via Linking.openURL (that only works in a browser address
    // bar) — write it to a real local file first, then hand that off via
    // the native share sheet so the user can view or save it.
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const fileUri = `${FileSystem.cacheDirectory}${attachment.name || "attachment"}`;
      await FileSystem.writeAsStringAsync(fileUri, attachment.data, { encoding: FileSystem.EncodingType.Base64 });
      await Share.share({ url: fileUri, title: attachment.name });
    } catch {
      setInlineError("Couldn't open the attachment on this device — try opening this payment link in a web browser instead.");
    }
  };

  // ─── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.fullCenter}>
        <Head>
          <title>Loading payment · BukkaPay</title>
          <meta name="robots" content="noindex" />
        </Head>
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
    const isNotFound = /not found/i.test(pageError);
    const errorTitle = isNotFound ? "Link Not Found" : "Link Unavailable";
    return (
      <View style={s.fullCenter}>
        <Head>
          <title>{`${errorTitle} · BukkaPay`}</title>
          <meta name="robots" content="noindex" />
        </Head>
        <View style={s.floatCard}>
          <View style={s.errorIconWrap}>
            <Ionicons name="alert-circle" size={52} color={RED} />
          </View>
          <Text style={s.errorTitle}>{errorTitle}</Text>
          <Text style={s.errorText}>{pageError}</Text>
          {!isNotFound && (
            <TouchableOpacity style={s.primaryBtn} onPress={fetchLink}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          )}
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
  const payUrl      = publicPayUrl(linkData.id);

  // ─── Fully Paid ──────────────────────────────────────────────
  if (isPaid) {
    return (
      <View style={s.fullCenter}>
        <Head>
          <title>{`Paid — ${displayName} · BukkaPay`}</title>
          <meta name="robots" content="noindex" />
        </Head>
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
        <Head>
          <title>{`Payment Sent · BukkaPay`}</title>
          <meta name="robots" content="noindex" />
        </Head>
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
          <TouchableOpacity style={s.waBtn} onPress={() => shareProofOfPayment(paidAmount)}>
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={s.waBtnText}>Share proof of payment</Text>
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
  const pageTitle = `Pay ${displayName} ${sym}${parseFloat(linkData.amount).toFixed(2)} · BukkaPay`;
  const pageDescription = linkData.description
    ? `${displayName} is requesting ${sym}${parseFloat(linkData.amount).toFixed(2)} for "${linkData.description}". Pay securely via BukkaPay.`
    : `${displayName} is requesting ${sym}${parseFloat(linkData.amount).toFixed(2)}. Pay securely via BukkaPay.`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`Payment request from ${displayName}`} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={payUrl} />
        <meta property="og:site_name" content="BukkaPay" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`Payment request from ${displayName}`} />
        <meta name="twitter:description" content={pageDescription} />
      </Head>
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
          </View>
        </View>

        {/* ── Payer card ── */}
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
            {linkData.invoice.attachment && (
              <TouchableOpacity style={s.attachmentRow} onPress={handleViewAttachment} activeOpacity={0.75}>
                <Ionicons name="document-attach" size={18} color={BLUE} />
                <Text style={s.attachmentName} numberOfLines={1}>{linkData.invoice.attachment.name}</Text>
                <Text style={s.attachmentAction}>View</Text>
              </TouchableOpacity>
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

            <View style={s.trustRow}>
              <Ionicons name="shield-checkmark" size={14} color={GREEN} />
              <Text style={s.trustTxt}>All payments are 256-bit encrypted and secured by BukkaPay</Text>
            </View>
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
          <TouchableOpacity style={s.stickyPayBtn} onPress={() => { setPayMethod("wallet"); setStep("wallet-form"); }}>
            <Ionicons name="wallet" size={18} color="#fff" />
            <Text style={s.stickyPayText}>Pay Now</Text>
          </TouchableOpacity>
        </View>
      )}

      <PinPrompt
        visible={showPinPrompt}
        subtitle={`Confirm this payment to ${displayName}`}
        onCancel={() => setShowPinPrompt(false)}
        onSubmit={handlePinSubmit}
      />
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
  attachmentRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12,
    borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, backgroundColor: SURFACE,
  },
  attachmentName: { flex: 1, fontSize: 13, fontWeight: "600", color: NAVY },
  attachmentAction: { fontSize: 13, fontWeight: "700", color: BLUE },

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

  footer: { marginTop: 24, marginBottom: 16, paddingHorizontal: 16, alignItems: "center", gap: 10 },
  footerBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  footerBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FDF4", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#DCFCE7" },
  footerBadgeText: { fontSize: 11, color: GREEN, fontWeight: "600" },
  footerText: { fontSize: 12, color: MUTED, textAlign: "center" },
});
