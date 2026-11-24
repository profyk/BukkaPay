import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Share, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useToast } from "../hooks/use-toast";
import { getCurrentUser, getAuthToken } from "../lib/auth";
import { API_BASE, APP_URL } from "../lib/config";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../lib/ThemeContext";

export default function Request() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors } = useTheme();
  const [amount, setAmount] = useState("0");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [step, setStep] = useState<"input" | "confirm" | "share">("input");
  const [requestId, setRequestId] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    })();
  }, []);

  const handleNumberClick = (num: string) => {
    if (amount === "0" && num !== ".") {
      setAmount(num);
    } else {
      if (num === "." && amount.includes(".")) return;
      setAmount(amount + num);
    }
  };

  const handleBackspace = () => {
    if (amount.length === 1) {
      setAmount("0");
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  const handleConfirm = () => {
    if (parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }
    if (!recipientName.trim()) {
      toast({ title: "Error", description: "Please enter recipient name", variant: "destructive" });
      return;
    }
    setStep("confirm");
  };

  const handleCreateRequest = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(API_BASE + "/api/payment-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, currency: "ZAR", recipientName, recipientPhone }),
      });

      if (!response.ok) throw new Error("Failed to create request");

      const request = await response.json();
      setRequestId(request.id);
      setStep("share");
      toast({ title: "Success", description: "Payment request created!" });
    } catch {
      toast({ title: "Error", description: "Error creating payment request", variant: "destructive" });
    }
  };

  // Requests go to a BukkaPay user: the link opens their incoming requests.
  const requestLink = `${APP_URL}/request?id=${requestId}`;

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(requestLink);
      toast({ title: "Copied", description: "Link copied to clipboard!" });
    } catch {}
  };

  const handleShareLink = async () => {
    try {
      await Share.share({ message: `I'm requesting R${amount} payment from you via BukkaPay. Click here to pay: ${requestLink}` });
    } catch {}
  };

  const numpadKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, ".", 0];

  if (step === "input") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Request Money</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.inputContent}>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Recipient Name</Text>
          <TextInput
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Enter name or contact"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
          />

          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Phone Number (Optional)</Text>
          <TextInput
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            placeholder="+1234567890"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
          />

          <View style={styles.amountDisplay}>
            <Text style={[styles.amountDollar, { color: colors.textMuted }]}>$</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>{amount}</Text>
          </View>

          <View style={styles.numpad}>
            {numpadKeys.map((num) => (
              <TouchableOpacity key={num.toString()} onPress={() => handleNumberClick(num.toString())} style={[styles.numpadKey, { backgroundColor: colors.surface }]}>
                <Text style={[styles.numpadText, { color: colors.text }]}>{num}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handleBackspace} style={[styles.numpadKey, { backgroundColor: colors.surface }]}>
              <Ionicons name="backspace" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleConfirm} style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (step === "confirm") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep("input")} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Confirm Request</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.confirmContent}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Amount</Text>
            <Text style={[styles.confirmAmount, { color: colors.text }]}>R{amount}</Text>
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <Text style={[styles.confirmDetailLabel, { color: colors.textMuted }]}>Recipient</Text>
            <Text style={[styles.confirmDetailValue, { color: colors.text }]}>{recipientName}</Text>
            {recipientPhone ? (
              <>
                <Text style={[styles.confirmDetailLabel, { color: colors.textMuted }]}>Phone</Text>
                <Text style={[styles.confirmDetailValue, { color: colors.text }]}>{recipientPhone}</Text>
              </>
            ) : null}
            <Text style={[styles.confirmDetailLabel, { color: colors.textMuted }]}>From</Text>
            <Text style={[styles.confirmDetailValue, { color: colors.text }]}>{user?.name}</Text>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity onPress={handleCreateRequest} style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Create Request</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("input")} style={[styles.outlineButton, { borderColor: colors.border }]}>
            <Text style={[styles.outlineButtonText, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Share Request</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.shareContent}>
        <View style={styles.shareCard}>
          <Text style={styles.shareLabel}>Request Amount</Text>
          <Text style={styles.shareAmount}>R{amount}</Text>
          <Text style={styles.shareFrom}>From {user?.name}</Text>
        </View>

        <View style={[styles.linkBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.linkLabel, { color: colors.textMuted }]}>SHARE LINK</Text>
          <View style={[styles.linkRow, { backgroundColor: colors.card }]}>
            <Text style={[styles.linkText, { color: colors.textMuted }]} numberOfLines={1}>{requestLink}</Text>
            <TouchableOpacity onPress={handleCopyLink}>
              <Ionicons name="copy" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.shareViaLabel, { color: colors.textMuted }]}>Share via:</Text>

        <TouchableOpacity onPress={handleShareLink} style={[styles.shareButton, { backgroundColor: "#10B981" }]}>
          <Ionicons name="share-social" size={20} color="#FFFFFF" />
          <Text style={styles.shareButtonText}>Share Link</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleCopyLink} style={[styles.outlineButton, { borderColor: colors.border }]}>
          <Ionicons name="copy" size={20} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={[styles.outlineButtonText, { color: colors.text }]}>Copy Link</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/(tabs)")} style={[styles.outlineButton, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 }]}>
          <Text style={[styles.outlineButtonText, { color: colors.text }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 24 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  inputContent: { paddingHorizontal: 24, paddingBottom: 32 },
  inputLabel: { fontSize: 14, fontWeight: "500", color: "#6B7280", marginBottom: 8, marginTop: 16 },
  textInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, fontSize: 15, color: "#1A1A2E", backgroundColor: "#F8F9FA" },
  amountDisplay: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  amountDollar: { fontSize: 32, fontWeight: "700", color: "#6B7280", marginRight: 4 },
  amountValue: { fontSize: 48, fontWeight: "700", color: "#1A1A2E" },
  numpad: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  numpadKey: { width: "31%", height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F9FA" },
  numpadText: { fontSize: 22, fontWeight: "500", color: "#1A1A2E" },
  continueButton: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  continueButtonText: { fontSize: 18, fontWeight: "600", color: "#FFFFFF" },
  outlineButton: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 12 },
  outlineButtonText: { fontSize: 16, fontWeight: "600", color: "#1A1A2E" },
  confirmContent: { paddingHorizontal: 24, paddingBottom: 32, flexGrow: 1 },
  confirmCard: { backgroundColor: "#F8F9FA", borderRadius: 16, padding: 24, marginBottom: 24 },
  confirmLabel: { fontSize: 14, color: "#6B7280", marginBottom: 8 },
  confirmAmount: { fontSize: 40, fontWeight: "700", color: "#1A1A2E", marginBottom: 16 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginBottom: 16 },
  confirmDetailLabel: { fontSize: 14, color: "#6B7280", marginBottom: 4, marginTop: 12 },
  confirmDetailValue: { fontSize: 16, fontWeight: "500", color: "#1A1A2E" },
  shareContent: { paddingHorizontal: 24, paddingBottom: 32, flexGrow: 1 },
  shareCard: { backgroundColor: "#7C3AED", borderRadius: 16, padding: 24, marginBottom: 24 },
  shareLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  shareAmount: { fontSize: 40, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 },
  shareFrom: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  linkBox: { backgroundColor: "#F8F9FA", borderRadius: 16, padding: 16, marginBottom: 24 },
  linkLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderRadius: 8, padding: 12 },
  linkText: { flex: 1, fontSize: 14, color: "#6B7280", marginRight: 8 },
  shareViaLabel: { fontSize: 14, fontWeight: "500", color: "#6B7280", marginBottom: 16 },
  shareButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 12, paddingVertical: 16 },
  shareButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
