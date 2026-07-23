import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, Share } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { APP_URL } from "../lib/config";
import { useTheme } from "../lib/ThemeContext";

const logoImage = require("../assets/logo.png");

interface Merchant { id: string; businessName: string; paymentLink: string; qrCode: string; }

export default function MerchantQrSlip() {
  const router = useRouter();
  const params = useLocalSearchParams<{ merchantId?: string }>();
  const { colors, darkMode } = useTheme();

  const { data: merchants = [] } = useQuery<Merchant[]>({ queryKey: ["/api/merchants"] });
  const merchant = merchants.find(m => m.id === params.merchantId) || merchants[0];

  const printSlip = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") { window.print(); return; }
    Share.share({ message: `Scan to pay ${merchant?.businessName} on BukkaPay: ${APP_URL}/merchant-pay/${merchant?.paymentLink}` });
  };

  if (!merchant) return null;

  const link = `${APP_URL}/merchant-pay/${merchant.paymentLink}`;
  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={[s.header, { borderBottomColor: darkMode ? "#2D2D44" : "#E5E7EB", backgroundColor: darkMode ? "#1A1A2E" : "#fff" }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: text }]}>Print QR Slip</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.centerWrap}>
        <View style={s.slip}>
          <Image source={logoImage} style={s.brandLogo} />
          <Text style={s.brandName}>BukkaPay</Text>
          <Text style={s.businessName}>{merchant.businessName}</Text>
          <View style={s.qrWrap}>
            <QRCode value={link} size={220} color="#001A72" backgroundColor="#FFFFFF" logo={logoImage} logoSize={36} logoBackgroundColor="#FFFFFF" />
          </View>
          <Text style={s.scanText}>SCAN TO PAY</Text>
          <Text style={s.qrCodeId}>{merchant.qrCode}</Text>
          <Text style={s.footerNote}>Powered by BukkaPay · Instant, secure payments</Text>
        </View>

        <Text style={[s.hint, { color: sub }]}>
          {Platform.OS === "web"
            ? "Print this page and stick it at your till or counter."
            : "Share this slip to print it from another device, or screenshot it to stick up in-store."}
        </Text>

        <TouchableOpacity style={s.printBtn} onPress={printSlip}>
          <Ionicons name={Platform.OS === "web" ? "print" : "share-social"} size={18} color="#fff" />
          <Text style={s.printBtnText}>{Platform.OS === "web" ? "Print Slip" : "Share Slip"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 48, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  slip: {
    backgroundColor: "#fff", borderRadius: 20, padding: 28, alignItems: "center",
    width: 300, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  brandLogo: { width: 36, height: 36, borderRadius: 8, marginBottom: 6 },
  brandName: { fontSize: 14, fontWeight: "800", color: "#001A72", letterSpacing: 0.5 },
  businessName: { fontSize: 19, fontWeight: "800", color: "#111827", marginTop: 10, textAlign: "center" },
  qrWrap: { marginTop: 20, marginBottom: 14, padding: 12, borderWidth: 2, borderColor: "#001A72", borderRadius: 16 },
  scanText: { fontSize: 15, fontWeight: "800", color: "#001A72", letterSpacing: 1.5 },
  qrCodeId: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  footerNote: { fontSize: 10, color: "#9CA3AF", marginTop: 16, textAlign: "center" },
  hint: { fontSize: 12.5, textAlign: "center", marginTop: 20, maxWidth: 280, lineHeight: 18 },
  printBtn: { flexDirection: "row", backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center", gap: 8, marginTop: 20 },
  printBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
