import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, Linking, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useToast } from "../hooks/use-toast";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

const BLUE  = "#1D4ED8";
const GREEN = "#16A34A";

type Section = "select" | "stitch" | "withdraw" | "pending";
type AccountType = "savings" | "current" | "transmission";

interface StitchBank { id: string; name: string; }

export default function TopUp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();

  const [section, setSection] = useState<Section>((params.section as Section) || "select");

  // Dynamic colors from theme
  const NAVY = colors.text;
  const MUTED = colors.textSecondary;
  const BORDER = colors.border;
  const BG = colors.background;
  const SURFACE = colors.surface;
  const INPUT_BG = colors.inputBg;
  const [amount, setAmount] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [banks, setBanks] = useState<StitchBank[]>([]);
  const [pendingPaymentId, setPendingPaymentId] = useState("");
  const [pendingCardId, setPendingCardId] = useState("");
  const [pendingAmount, setPendingAmount] = useState("");

  // Withdraw form state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedBank, setSelectedBank] = useState<StitchBank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("savings");
  const [showBankList, setShowBankList] = useState(false);

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stitch/banks`);
      if (res.ok) {
        const data = await res.json();
        setBanks(data.banks || []);
      }
    } catch {}
  };

  const handleStitchTopUp = async () => {
    if (!amount || parseFloat(amount) < 10) {
      toast({ title: "Minimum R10", description: "Enter at least R10 to top up", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const headers = await getAuthHeader();
      const userRes = await fetch(`${API_BASE}/api/user/me`, { headers: headers as HeadersInit });
      if (!userRes.ok) throw new Error("Please log in to top up");

      const userData = await userRes.json();
      const walletCards = userData.walletCards || [];
      if (!walletCards.length) throw new Error("No wallet card found");
      const cardId = walletCards[0].id;

      const res = await fetch(`${API_BASE}/api/wallet/topup/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers as object) },
        body: JSON.stringify({ walletCardId: cardId, amount, currency: "ZAR" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate payment");

      setPendingPaymentId(data.paymentRequestId);
      setPendingCardId(cardId);
      setPendingAmount(amount);

      if (Platform.OS === "web") {
        window.location.href = data.paymentUrl;
      } else {
        await Linking.openURL(data.paymentUrl);
        setSection("pending");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPayment = async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/api/wallet/topup/stitch/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers as object) },
        body: JSON.stringify({
          paymentRequestId: pendingPaymentId,
          walletCardId: pendingCardId,
          amount: pendingAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      if (data.status === "pending") {
        toast({ title: "Still Processing", description: "Payment is still pending. Try again in a moment.", variant: "destructive" });
      } else if (data.status === "completed") {
        toast({ title: "Top-Up Successful!", description: `R${parseFloat(pendingAmount).toFixed(2)} added to your wallet.` });
        setSection("select");
        setAmount("");
        setPendingPaymentId("");
      } else {
        toast({ title: "Payment Failed", description: "Your payment was not completed.", variant: "destructive" });
        setSection("select");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) < 50) {
      toast({ title: "Minimum R50", description: "Enter at least R50 to withdraw", variant: "destructive" });
      return;
    }
    if (!selectedBank || !accountNumber || !accountName) {
      toast({ title: "Missing Info", description: "Please fill in all bank details", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const headers = await getAuthHeader();
      const userRes = await fetch(`${API_BASE}/api/user/me`, { headers: headers as HeadersInit });
      if (!userRes.ok) throw new Error("Please log in to withdraw");
      const userData = await userRes.json();
      const walletCards = userData.walletCards || [];
      if (!walletCards.length) throw new Error("No wallet card found");
      const cardId = walletCards[0].id;

      const res = await fetch(`${API_BASE}/api/wallet/withdraw/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers as object) },
        body: JSON.stringify({
          walletCardId: cardId,
          amount: withdrawAmount,
          currency: "ZAR",
          bankId: selectedBank.id,
          accountNumber,
          accountType,
          accountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");

      toast({ title: "Withdrawal Submitted", description: data.message || "Funds arrive in 1–2 business days." });
      setSection("select");
      setWithdrawAmount("");
      setAccountNumber("");
      setAccountName("");
      setSelectedBank(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoucherTopUp = async () => {
    if (!voucherCode) {
      toast({ title: "Error", description: "Please enter a voucher code", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Voucher redeemed successfully!" });
    setVoucherCode("");
    setSection("select");
  };

  // ─── Select Screen ────────────────────────────────────────────────────────
  if (section === "select") {
    return (
      <View style={[s.container, { backgroundColor: BG }]}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={NAVY} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: NAVY }]}>Wallet</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
          <Text style={[s.sectionLabel, { color: MUTED }]}>Add Money</Text>

          <TouchableOpacity style={[s.optionCard, { backgroundColor: SURFACE, borderColor: BORDER }]} onPress={() => setSection("stitch")}>
            <View style={[s.optionIcon, { backgroundColor: BLUE }]}>
              <Ionicons name="swap-horizontal" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.optionTitle, { color: BLUE }]}>Instant Bank Pay</Text>
              <Text style={[s.optionSub, { color: MUTED }]}>Pay via your bank · Powered by Stitch</Text>
            </View>
            <View style={[s.badge, { backgroundColor: darkMode ? "rgba(22,163,74,0.2)" : "#DCFCE7" }]}>
              <Text style={s.badgeText}>Instant</Text>
            </View>
          </TouchableOpacity>

          <View style={[s.divider, { backgroundColor: BORDER }]} />

          <Text style={[s.sectionLabel, { color: MUTED }]}>Withdraw Funds</Text>

          <TouchableOpacity style={[s.optionCard, { backgroundColor: SURFACE, borderColor: BORDER }]} onPress={() => setSection("withdraw")}>
            <View style={[s.optionIcon, { backgroundColor: "#EA580C" }]}>
              <Ionicons name="arrow-up-circle" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.optionTitle, { color: "#EA580C" }]}>Withdraw to Bank</Text>
              <Text style={[s.optionSub, { color: MUTED }]}>Send to your bank account via Stitch</Text>
            </View>
            <Text style={[s.optionSub, { color: MUTED }]}>1–2 days</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── Stitch Top-Up ────────────────────────────────────────────────────────
  if (section === "stitch") {
    return (
      <ScrollView style={[s.container, { backgroundColor: BG }]} contentContainerStyle={s.scrollContent}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => setSection("select")}>
            <Ionicons name="arrow-back" size={24} color={NAVY} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: NAVY }]}>Instant Bank Pay</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.heroBanner}>
          <Ionicons name="swap-horizontal" size={32} color="#fff" />
          <Text style={s.heroSub}>Powered by Stitch</Text>
          <Text style={s.heroTitle}>Instant Bank Payment</Text>
        </View>

        <View style={[s.infoBox, { backgroundColor: darkMode ? "rgba(59,130,246,0.15)" : "#EFF6FF" }]}>
          <Ionicons name="information-circle" size={18} color={BLUE} />
          <Text style={[s.infoText, { color: darkMode ? "#93C5FD" : "#1E40AF" }]}>
            You'll be redirected to your bank's secure login page. No card details needed.
          </Text>
        </View>

        <Text style={[s.label, { color: NAVY }]}>Amount (ZAR)</Text>
        <View style={s.amountRow}>
          <Text style={[s.currencyPrefix, { color: NAVY }]}>R</Text>
          <TextInput
            style={[s.input, { flex: 1, backgroundColor: INPUT_BG, borderColor: BORDER, color: NAVY }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={MUTED}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={s.quickRow}>
          {["50", "100", "250", "500"].map((v) => (
            <TouchableOpacity key={v} style={[s.quickBtn, { backgroundColor: SURFACE, borderColor: BORDER }]} onPress={() => setAmount(v)}>
              <Text style={[s.quickBtnText, { color: NAVY }]}>R{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: BLUE }, isLoading && { opacity: 0.7 }]}
          onPress={handleStitchTopUp}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
              <Text style={s.primaryBtnText}>
                {amount ? `Top Up R${parseFloat(amount || "0").toFixed(2)}` : "Continue to Bank"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={s.trustRow}>
          <Ionicons name="shield-checkmark" size={14} color={GREEN} />
          <Text style={[s.trustText, { color: MUTED }]}>Secured by Stitch · Bank-grade encryption</Text>
        </View>
      </ScrollView>
    );
  }

  // ─── Pending Payment ──────────────────────────────────────────────────────
  if (section === "pending") {
    return (
      <View style={[s.container, { backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 32 }]}>
        <Ionicons name="hourglass" size={56} color={BLUE} />
        <Text style={[s.heroTitle, { color: NAVY, marginTop: 16, textAlign: "center" }]}>Waiting for Payment</Text>
        <Text style={[s.optionSub, { color: MUTED, textAlign: "center", marginTop: 8, marginBottom: 32 }]}>
          Complete the payment in your browser, then tap below to confirm.
        </Text>

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: GREEN, width: "100%" }, isLoading && { opacity: 0.7 }]}
          onPress={handleVerifyPayment}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.primaryBtnText}>I've Paid — Confirm</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[s.outlineBtn, { marginTop: 12, width: "100%", borderColor: BORDER }]} onPress={() => setSection("select")}>
          <Text style={[s.outlineBtnText, { color: MUTED }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Withdraw ─────────────────────────────────────────────────────────────
  if (section === "withdraw") {
    return (
      <ScrollView style={[s.container, { backgroundColor: BG }]} contentContainerStyle={s.scrollContent}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => { setSection("select"); setShowBankList(false); }}>
            <Ionicons name="arrow-back" size={24} color={NAVY} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: NAVY }]}>Withdraw to Bank</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[s.heroBanner, { backgroundColor: "#EA580C" }]}>
          <Ionicons name="arrow-up-circle" size={32} color="#fff" />
          <Text style={s.heroSub}>Via Stitch Disbursement</Text>
          <Text style={s.heroTitle}>Bank Withdrawal</Text>
        </View>

        <Text style={[s.label, { color: NAVY }]}>Amount (ZAR) — Min R50</Text>
        <View style={s.amountRow}>
          <Text style={[s.currencyPrefix, { color: NAVY }]}>R</Text>
          <TextInput
            style={[s.input, { flex: 1, backgroundColor: INPUT_BG, borderColor: BORDER, color: NAVY }]}
            value={withdrawAmount}
            onChangeText={setWithdrawAmount}
            placeholder="0.00"
            placeholderTextColor={MUTED}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={[s.label, { color: NAVY }]}>Bank</Text>
        <TouchableOpacity style={[s.selectBtn, { backgroundColor: INPUT_BG, borderColor: BORDER }]} onPress={() => setShowBankList(!showBankList)}>
          <Text style={[s.selectBtnText, { color: selectedBank ? NAVY : MUTED }]}>
            {selectedBank ? selectedBank.name : "Select your bank"}
          </Text>
          <Ionicons name={showBankList ? "chevron-up" : "chevron-down"} size={18} color={MUTED} />
        </TouchableOpacity>

        {showBankList && (
          <View style={[s.bankList, { borderColor: BORDER }]}>
            {banks.map((bank) => (
              <TouchableOpacity
                key={bank.id}
                style={[s.bankItem, { borderColor: BORDER }, selectedBank?.id === bank.id && { backgroundColor: SURFACE }]}
                onPress={() => { setSelectedBank(bank); setShowBankList(false); }}
              >
                <Text style={[s.bankItemText, { color: NAVY }, selectedBank?.id === bank.id && { color: BLUE, fontWeight: "700" }]}>
                  {bank.name}
                </Text>
                {selectedBank?.id === bank.id && <Ionicons name="checkmark" size={16} color={BLUE} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[s.label, { color: NAVY }]}>Account Holder Name</Text>
        <TextInput
          style={[s.input, { backgroundColor: INPUT_BG, borderColor: BORDER, color: NAVY }]}
          value={accountName}
          onChangeText={setAccountName}
          placeholder="Full name on account"
          placeholderTextColor={MUTED}
          autoCapitalize="words"
        />

        <Text style={[s.label, { color: NAVY }]}>Account Number</Text>
        <TextInput
          style={[s.input, { backgroundColor: INPUT_BG, borderColor: BORDER, color: NAVY }]}
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="Bank account number"
          placeholderTextColor={MUTED}
          keyboardType="number-pad"
        />

        <Text style={[s.label, { color: NAVY }]}>Account Type</Text>
        <View style={s.toggleRow}>
          {(["savings", "current", "transmission"] as AccountType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.toggleBtn, { borderColor: BORDER }, accountType === t && [s.toggleBtnActive, { backgroundColor: darkMode ? "rgba(29,78,216,0.2)" : "#EFF6FF" }]]}
              onPress={() => setAccountType(t)}
            >
              <Text style={[s.toggleTxt, { color: MUTED }, accountType === t && s.toggleTxtActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: "#EA580C" }, isLoading && { opacity: 0.7 }]}
          onPress={handleWithdraw}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="arrow-up-circle" size={20} color="#fff" />
              <Text style={s.primaryBtnText}>
                {withdrawAmount ? `Withdraw R${parseFloat(withdrawAmount || "0").toFixed(2)}` : "Withdraw"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[s.trustText, { color: MUTED, textAlign: "center", marginTop: 12 }]}>
          Funds typically arrive within 1–2 business days
        </Text>
      </ScrollView>
    );
  }

  // ─── Voucher ──────────────────────────────────────────────────────────────
  return (
    <ScrollView style={[s.container, { backgroundColor: BG }]} contentContainerStyle={s.scrollContent}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => setSection("select")}>
          <Ionicons name="arrow-back" size={24} color={NAVY} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: NAVY }]}>Redeem Voucher</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[s.heroBanner, { backgroundColor: GREEN }]}>
        <Ionicons name="ticket" size={32} color="#fff" />
        <Text style={s.heroSub}>Voucher Redemption</Text>
        <Text style={s.heroTitle}>Instant Credit</Text>
      </View>

      <Text style={[s.label, { color: NAVY }]}>Voucher Code</Text>
      <TextInput
        style={[s.input, { backgroundColor: INPUT_BG, borderColor: BORDER, color: NAVY, textAlign: "center", letterSpacing: 4, fontFamily: "monospace" }]}
        value={voucherCode}
        onChangeText={(t) => setVoucherCode(t.toUpperCase())}
        placeholder="Enter voucher code"
        placeholderTextColor={MUTED}
        autoCapitalize="characters"
      />

      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: GREEN }]} onPress={handleVoucherTopUp}>
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.primaryBtnText}>Redeem Voucher</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 48 },
  content: { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 8 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 16, paddingHorizontal: 24,
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginBottom: 12, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  optionCard: { flexDirection: "row", alignItems: "center", padding: 18, borderRadius: 16, marginBottom: 12, gap: 14, borderWidth: 1 },
  optionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: 16, fontWeight: "700" },
  optionSub: { fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: "#DCFCE7", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700", color: GREEN },
  divider: { height: 1, marginVertical: 20 },
  heroBanner: { backgroundColor: BLUE, borderRadius: 20, padding: 24, marginBottom: 24 },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 12 },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#fff", marginTop: 4 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 20 },
  infoText: { flex: 1, fontSize: 13, color: "#1E40AF", lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 16 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  currencyPrefix: { fontSize: 22, fontWeight: "700" },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16 },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 4 },
  quickBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1 },
  quickBtnText: { fontSize: 14, fontWeight: "600" },
  primaryBtn: {
    borderRadius: 16, paddingVertical: 16, flexDirection: "row",
    justifyContent: "center", alignItems: "center", gap: 8, marginTop: 24,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  outlineBtn: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  outlineBtnText: { fontWeight: "600", fontSize: 15 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 16 },
  trustText: { fontSize: 12 },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderRadius: 12, padding: 14 },
  selectBtnText: { fontSize: 15 },
  bankList: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 4 },
  bankItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  bankItemText: { fontSize: 15 },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  toggleBtnActive: { borderColor: BLUE, backgroundColor: "#EFF6FF" },
  toggleTxt: { fontSize: 13, fontWeight: "600" },
  toggleTxtActive: { color: BLUE },
});
