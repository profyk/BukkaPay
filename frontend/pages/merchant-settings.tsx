import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, Image, Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

interface Merchant {
  id: string;
  businessName: string;
  businessType: string;
  businessCategory?: string;
  businessLogo?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessRegNumber?: string;
  vatNumber?: string;
  website?: string;
  bankId?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  accountType?: string;
}

interface Bank { id: string; name: string; }

const notify = (title: string, message?: string) => {
  if (Platform.OS === "web") { window.alert(message ? `${title}\n\n${message}` : title); return; }
  const { Alert } = require("react-native");
  Alert.alert(title, message);
};

export default function MerchantSettings() {
  const router = useRouter();
  const params = useLocalSearchParams<{ merchantId?: string }>();
  const { colors, darkMode } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: merchants = [] } = useQuery<Merchant[]>({ queryKey: ["/api/merchants"] });
  const merchant = merchants.find(m => m.id === params.merchantId) || merchants[0];

  const [section, setSection] = useState<"business" | "banking">("business");

  // Business details
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState("image/jpeg");

  // Banking
  const [bankId, setBankId] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("savings");
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    if (!merchant) return;
    setBusinessName(merchant.businessName || "");
    setBusinessEmail(merchant.businessEmail || "");
    setBusinessPhone(merchant.businessPhone || "");
    setBusinessAddress(merchant.businessAddress || "");
    setBusinessRegNumber(merchant.businessRegNumber || "");
    setVatNumber(merchant.vatNumber || "");
    setWebsite(merchant.website || "");
    setLogoUri(merchant.businessLogo || null);
    setBankId(merchant.bankId || "");
    setAccountHolder(merchant.accountHolder || "");
    setAccountType(merchant.accountType || "savings");
  }, [merchant?.id]);

  const { data: banks = [] } = useQuery<Bank[]>({ queryKey: ["/api/merchants/banks"] });

  const saveBusinessMutation = useMutation({
    mutationFn: async () => {
      let businessLogoUrl = merchant?.businessLogo || null;
      if (logoBase64) {
        const res = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
          body: JSON.stringify({ base64: logoBase64, mimeType: logoMime, filename: "business-logo.jpg" }),
        });
        if (res.ok) { const d = await res.json(); businessLogoUrl = d.url; }
      }
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({
          businessName: businessName.trim(), businessLogo: businessLogoUrl,
          businessEmail: businessEmail.trim() || undefined, businessPhone: businessPhone.trim() || undefined,
          businessAddress: businessAddress.trim() || undefined, businessRegNumber: businessRegNumber.trim() || undefined,
          vatNumber: vatNumber.trim() || undefined, website: website.trim() || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not save changes"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      toast({ title: "Saved", description: "Business details updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const saveBankingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}/banking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ bankId, accountHolder: accountHolder.trim(), accountNumber: accountNumber.trim(), accountType }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not save banking details"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      setAccountNumber("");
      toast({ title: "Saved", description: "Banking details updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { notify("Permission needed", "Please allow photo access to upload a logo."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLogoUri(asset.uri);
      if (asset.base64) { setLogoBase64(asset.base64); setLogoMime(asset.mimeType || "image/jpeg"); }
    }
  };

  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const card = darkMode ? "#1A1A2E" : "#FFFFFF";
  const border = darkMode ? "#2D2D44" : "#E5E7EB";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";
  const selectedBank = banks.find(b => b.id === bankId);

  if (!merchant) {
    return (
      <View style={[s.center, { backgroundColor: bg }]}>
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[s.segment, { backgroundColor: card, borderColor: border }]}>
        {(["business", "banking"] as const).map(k => (
          <TouchableOpacity
            key={k}
            style={[s.segmentBtn, section === k && { backgroundColor: "#7C3AED" }]}
            onPress={() => setSection(k)}
          >
            <Text style={[s.segmentText, { color: section === k ? "#fff" : sub }]}>
              {k === "business" ? "Business Details" : "Banking / Payouts"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {section === "business" && (
          <View>
            <Text style={[s.fieldLabel, { color: text }]}>Business Logo</Text>
            <TouchableOpacity style={[s.logoBox, { borderColor: border, backgroundColor: card }]} onPress={pickLogo}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={s.logoImg} />
              ) : (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Ionicons name="camera" size={26} color="#7C3AED" />
                  <Text style={{ color: sub, fontSize: 12 }}>Tap to upload logo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={[s.fieldLabel, { color: text }]}>Business Name</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={businessName} onChangeText={setBusinessName} placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Business Email</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={businessEmail} onChangeText={setBusinessEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Business Phone</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={businessPhone} onChangeText={setBusinessPhone} keyboardType="phone-pad" placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Business Address</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={businessAddress} onChangeText={setBusinessAddress} placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Registration Number</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={businessRegNumber} onChangeText={setBusinessRegNumber} autoCapitalize="characters" placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>VAT Number</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={vatNumber} onChangeText={setVatNumber} keyboardType="numeric" placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Website</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" placeholderTextColor={sub} />

            <TouchableOpacity
              style={[s.saveBtn, saveBusinessMutation.isPending && { opacity: 0.6 }]}
              onPress={() => saveBusinessMutation.mutate()}
              disabled={saveBusinessMutation.isPending}
            >
              {saveBusinessMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        )}

        {section === "banking" && (
          <View>
            <View style={[s.infoBanner, { backgroundColor: darkMode ? "rgba(124,58,237,0.15)" : "#F3E8FF" }]}>
              <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
              <Text style={[s.infoBannerText, { color: darkMode ? "#D8B4FE" : "#6B21A8" }]}>
                Payouts are sent here via Stitch whenever you withdraw from your merchant wallet.
              </Text>
            </View>

            {merchant.accountNumber && (
              <View style={[s.currentBankCard, { backgroundColor: card, borderColor: border }]}>
                <Ionicons name="business" size={20} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.currentBankName, { color: text }]}>{merchant.bankName}</Text>
                  <Text style={[s.currentBankAcc, { color: sub }]}>{merchant.accountHolder} · {merchant.accountNumber}</Text>
                </View>
              </View>
            )}

            <Text style={[s.fieldLabel, { color: text }]}>Bank</Text>
            <TouchableOpacity style={[s.input, s.bankPicker, { backgroundColor: card, borderColor: border }]} onPress={() => setShowBankPicker(!showBankPicker)}>
              <Text style={{ color: selectedBank ? text : sub, fontSize: 14 }}>{selectedBank?.name || "Select your bank"}</Text>
              <Ionicons name={showBankPicker ? "chevron-up" : "chevron-down"} size={16} color={sub} />
            </TouchableOpacity>
            {showBankPicker && (
              <View style={[s.bankList, { backgroundColor: card, borderColor: border }]}>
                {banks.map(b => (
                  <TouchableOpacity key={b.id} style={s.bankOption} onPress={() => { setBankId(b.id); setShowBankPicker(false); }}>
                    <Text style={{ color: text, fontSize: 14 }}>{b.name}</Text>
                    {bankId === b.id && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[s.fieldLabel, { color: text }]}>Account Holder Name</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={accountHolder} onChangeText={setAccountHolder} placeholder="Full name / registered business name" placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Account Number</Text>
            <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder={merchant.accountNumber ? "Enter a new number to change it" : "e.g. 1234567890"} placeholderTextColor={sub} />

            <Text style={[s.fieldLabel, { color: text }]}>Account Type</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {(["savings", "current", "cheque"] as const).map(t => (
                <TouchableOpacity key={t} style={[s.typeChip, { backgroundColor: card, borderColor: accountType === t ? "#7C3AED" : border }]} onPress={() => setAccountType(t)}>
                  <Text style={{ color: accountType === t ? "#7C3AED" : sub, fontSize: 13, fontWeight: "600" }}>{t[0].toUpperCase() + t.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.saveBtn, (!bankId || !accountHolder.trim() || !accountNumber.trim() || saveBankingMutation.isPending) && { opacity: 0.45 }]}
              onPress={() => saveBankingMutation.mutate()}
              disabled={!bankId || !accountHolder.trim() || !accountNumber.trim() || saveBankingMutation.isPending}
            >
              {saveBankingMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Banking Details</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 48, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  segment: { flexDirection: "row", margin: 20, marginBottom: 0, borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: "center" },
  segmentText: { fontSize: 13, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: "500" },
  logoBox: {
    borderWidth: 2, borderStyle: "dashed", borderRadius: 16, height: 110, width: 110,
    alignItems: "center", justifyContent: "center", marginBottom: 4, overflow: "hidden",
  },
  logoImg: { width: "100%", height: "100%" },
  saveBtn: { backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 24 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  infoBanner: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 12, padding: 12, marginBottom: 14 },
  infoBannerText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  currentBankCard: { flexDirection: "row", gap: 12, alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  currentBankName: { fontSize: 14, fontWeight: "700" },
  currentBankAcc: { fontSize: 12, marginTop: 2 },
  bankPicker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bankList: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: "hidden" },
  bankOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  typeChip: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
});
