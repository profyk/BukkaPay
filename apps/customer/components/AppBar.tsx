import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, Image, StyleSheet, Modal, Pressable, Platform, StatusBar } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { logout, getCurrentUser } from "../lib/auth";
import { getAuthHeader } from "../lib/auth";
import { API_BASE } from "../lib/config";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "../lib/ThemeContext";

const logoImage = require("../assets/logo.png");

const STATUSBAR_HEIGHT = Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 44;

export default function AppBar() {
  const router = useRouter();
  const { colors } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) {
        setWalletId(user.walletId || "");
        setUserName(user.name || "");
      }
    })();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/(auth)/login");
  };

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/notifications/unread-count`, { headers: await getAuthHeader() });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count as number;
    },
    refetchInterval: 30000,
  });

  const qrValue = walletId ? `bukkapay://pay/${walletId}` : "bukkapay://invalid";

  const menuItems = [
    { label: "My BKP Code", icon: "qr-code-outline" as const, action: () => setShowQR(true) },
    { label: "Explore Features", icon: "compass-outline" as const, action: () => router.push("/(screens)/features-hub" as any) },
    { label: "Purchases Hub", icon: "bag-handle-outline" as const, action: () => router.push("/(screens)/purchases-hub" as any) },
    { label: "My Payment Links", icon: "link-outline" as const, action: () => router.push("/(screens)/payment-links" as any) },
    { label: "Support Chat", icon: "chatbubbles-outline" as const, action: () => router.push("/(screens)/support-chat" as any) },
    { label: "Settings", icon: "settings-outline" as const, action: () => router.push("/(tabs)/profile") },
    { label: "Logout", icon: "log-out-outline" as const, action: handleLogout },
  ];

  return (
    <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.navBorder }]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image source={logoImage} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.title, { color: colors.text }]}>BukkaPay</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Smart Wallet · v2</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push("/(screens)/search" as any)}
          >
            <Ionicons name="search" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push("/(screens)/notifications" as any)}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {unreadCount > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.dropdown, { backgroundColor: colors.card }]}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.menuItem,
                  idx < menuItems.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.divider }],
                ]}
                onPress={() => {
                  setMenuOpen(false);
                  item.action();
                }}
              >
                <Ionicons name={item.icon} size={18} color={item.label === "Logout" ? "#EF4444" : colors.text} style={styles.menuIcon} />
                <Text style={[
                  styles.menuItemText,
                  { color: colors.text },
                  item.label === "Logout" && styles.menuItemLogout,
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showQR}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQR(false)}
      >
        <Pressable style={styles.qrOverlay} onPress={() => setShowQR(false)}>
          <Pressable style={[styles.qrModal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.qrModalHeader}>
              <View style={{ width: 24 }} />
              <Text style={[styles.qrModalTitle, { color: colors.text }]}>My BKP Code</Text>
              <TouchableOpacity onPress={() => setShowQR(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrBrandRow}>
              <Image source={logoImage} style={styles.qrBrandLogo} />
              <View>
                <Text style={[styles.qrBrandName, { color: colors.text }]}>BukkaPay</Text>
                <Text style={[styles.qrBrandTag, { color: colors.textMuted }]}>Payment QR Code</Text>
              </View>
            </View>

            <View style={styles.qrCodeWrap}>
              <QRCode
                value={qrValue}
                size={200}
                color="#001A72"
                backgroundColor="#FFFFFF"
                logo={logoImage}
                logoSize={40}
                logoBackgroundColor="#FFFFFF"
                logoBorderRadius={10}
                logoMargin={4}
                ecl="H"
                quietZone={8}
              />
            </View>

            <Text style={[styles.qrUserName, { color: colors.text }]}>{userName}</Text>
            <View style={[styles.qrBkpBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.qrBkpLabel, { color: colors.primary }]}>BKP</Text>
              <Text style={[styles.qrBkpValue, { color: colors.text }]}>{walletId || "Not available"}</Text>
            </View>

            <Text style={[styles.qrScanHint, { color: colors.textMuted }]}>Scan to pay me instantly</Text>

            <TouchableOpacity
              style={[styles.qrViewFullBtn, { borderColor: colors.border }]}
              onPress={() => { setShowQR(false); router.push("/(screens)/my-id" as any); }}
            >
              <Text style={styles.qrViewFullText}>View Full Details</Text>
              <Ionicons name="arrow-forward" size={16} color="#7C3AED" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: STATUSBAR_HEIGHT + 4,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  content: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  title: {
    fontWeight: "700",
    fontSize: 20,
    color: "#1A1A2E",
  },
  subtitle: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: STATUSBAR_HEIGHT + 56,
    paddingRight: 16,
  },
  dropdown: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuIcon: {
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  menuItemLogout: {
    color: "#EF4444",
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  qrModal: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  qrModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
  },
  qrModalTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  qrBrandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  qrBrandLogo: { width: 32, height: 32, borderRadius: 8 },
  qrBrandName: { fontSize: 15, fontWeight: "700", color: "#001A72" },
  qrBrandTag: { fontSize: 11, color: "#6B7280" },
  qrCodeWrap: {
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#F0F0F0",
    marginBottom: 16,
  },
  qrUserName: { fontSize: 17, fontWeight: "700", color: "#1A1A2E", marginBottom: 6 },
  qrBkpBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F0FF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
    marginBottom: 8,
  },
  qrBkpLabel: { fontSize: 12, fontWeight: "800", color: "#7C3AED" },
  qrBkpValue: { fontSize: 13, fontWeight: "600", color: "#1A1A2E", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  qrScanHint: { fontSize: 13, color: "#9CA3AF", marginBottom: 16 },
  qrViewFullBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
  },
  qrViewFullText: { fontSize: 14, fontWeight: "600", color: "#7C3AED" },
});
