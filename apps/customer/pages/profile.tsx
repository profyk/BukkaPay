import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Switch, ActivityIndicator, StyleSheet, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCurrentUser, login, logout, setCurrentUser,
  isBiometricAvailable, isBiometricLoginEnabled,
  enableBiometricLogin, disableBiometricLogin, getBiometricType,
} from "../lib/auth";
import { apiRequest } from "../lib/queryClient";
import { getKycStatus } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import { useTheme } from "../lib/ThemeContext";
import * as Clipboard from "expo-clipboard";

const languages = [
  { code: "en-US", name: "English (US)", flag: "US" },
  { code: "en-GB", name: "English (UK)", flag: "GB" },
  { code: "es", name: "Spanish", flag: "ES" },
  { code: "fr", name: "French", flag: "FR" },
  { code: "de", name: "German", flag: "DE" },
  { code: "pt", name: "Portuguese", flag: "PT" },
  { code: "zh", name: "Chinese", flag: "CN" },
  { code: "ja", name: "Japanese", flag: "JP" },
  { code: "ko", name: "Korean", flag: "KR" },
  { code: "ar", name: "Arabic", flag: "SA" },
  { code: "hi", name: "Hindi", flag: "IN" },
  { code: "sw", name: "Swahili", flag: "KE" },
];

const avatarOptions = [
  { id: "blue-user", color: "#3B82F6" },
  { id: "green-user", color: "#22C55E" },
  { id: "purple-user", color: "#A855F7" },
  { id: "orange-user", color: "#F97316" },
  { id: "pink-user", color: "#EC4899" },
  { id: "cyan-user", color: "#06B6D4" },
  { id: "red-user", color: "#EF4444" },
  { id: "amber-user", color: "#F59E0B" },
  { id: "indigo-user", color: "#6366F1" },
  { id: "teal-user", color: "#14B8A6" },
  { id: "rose-user", color: "#F43F5E" },
  { id: "emerald-user", color: "#10B981" },
];

export default function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { darkMode, setDarkMode, colors } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Login");
  const [showBiometricPasswordModal, setShowBiometricPasswordModal] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState("");
  const [confirmingBiometric, setConfirmingBiometric] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
      } else {
        router.replace("/(auth)/login");
      }
      const lang = await AsyncStorage.getItem("app_language");
      if (lang) setSelectedLanguage(lang);
      const hide = await AsyncStorage.getItem("hide_balance");
      if (hide === "true") setHideBalance(true);

      const bioAvailable = await isBiometricAvailable();
      setBiometricSupported(bioAvailable);
      if (bioAvailable) {
        const type = await getBiometricType();
        setBiometricLabel(type === "Face ID" ? "Face ID Login" : type === "Fingerprint" ? "Fingerprint Login" : "Biometric Login");
        const bioEnabled = await isBiometricLoginEnabled();
        setBiometricEnabled(bioEnabled);
      }
    })();
  }, []);

  const { data: kycStatus } = useQuery<any>({ queryKey: ["kyc-status"], queryFn: getKycStatus, enabled: !!user });

  const { data: cards } = useQuery<any[]>({ queryKey: ["/api/cards"], enabled: !!user });
  const { data: transactions } = useQuery<any[]>({ queryKey: ["/api/transactions"], enabled: !!user });
  const { data: loyalty } = useQuery<any>({ queryKey: ["/api/loyalty"], enabled: !!user });

  const totalBalance = cards?.reduce((sum: number, card: any) => sum + parseFloat(card.balance || "0"), 0) || 0;
  const transactionCount = transactions?.length || 0;
  const loyaltyPoints = loyalty?.totalPoints || user?.loyaltyPoints || 0;

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name?: string; phone?: string }) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      return res.json();
    },
    onSuccess: async (updatedUser: any) => {
      await setCurrentUser(updatedUser);
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowEditModal(false);
      toast({ title: "Success", description: "Profile updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update profile", variant: "destructive" });
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatar: string) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", { avatar });
      return res.json();
    },
    onSuccess: async (updatedUser: any) => {
      await setCurrentUser(updatedUser);
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowAvatarModal(false);
      toast({ title: "Success", description: "Avatar updated!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update avatar", variant: "destructive" });
    },
  });

  const openEditModal = () => {
    if (user) {
      setEditName(user.name || "");
      setEditPhone(user.phone || "");
      setShowEditModal(true);
    }
  };

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    updateProfileMutation.mutate({ name: editName.trim(), phone: editPhone.trim() || undefined });
  };

  const getAvatarColor = (avatarId: string | null | undefined) => {
    if (!avatarId) return null;
    return avatarOptions.find((a) => a.id === avatarId)?.color;
  };

  const isPhotoAvatar = (avatar: string | null | undefined) =>
    !!avatar && (avatar.startsWith("data:") || avatar.startsWith("http"));

  const handleLanguageSelect = async (code: string) => {
    setSelectedLanguage(code);
    await AsyncStorage.setItem("app_language", code);
    const lang = languages.find((l) => l.code === code);
    toast({ title: "Success", description: `Language changed to ${lang?.name || code}` });
    setShowLanguageModal(false);
  };

  const getCurrentLanguageName = () => {
    return languages.find((l) => l.code === selectedLanguage)?.name || "English (US)";
  };

  const copyWalletID = async () => {
    if (user?.walletId) {
      await Clipboard.setStringAsync(user.walletId);
      setCopied(true);
      toast({ title: "Copied", description: "Wallet ID copied!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      // Enabling needs the real password (to unlock biometric sign-in
      // later) — this screen never has it in memory, so confirm it here
      // rather than silently saving a blank one.
      setBiometricPassword("");
      setShowBiometricPasswordModal(true);
    } else {
      setBiometricEnabled(false);
      await disableBiometricLogin();
      toast({ title: "Disabled", description: "Biometric login disabled" });
    }
  };

  const handleConfirmBiometricPassword = async () => {
    if (!biometricPassword) {
      toast({ title: "Enter your password", variant: "destructive" });
      return;
    }
    setConfirmingBiometric(true);
    try {
      await login(user.email, biometricPassword);
      await enableBiometricLogin(user.email, biometricPassword);
      setBiometricEnabled(true);
      setShowBiometricPasswordModal(false);
      setBiometricPassword("");
      toast({ title: "Enabled", description: `${biometricLabel} is ready to use.` });
    } catch (e: any) {
      toast({ title: "Incorrect password", description: "Biometric login was not enabled.", variant: "destructive" });
    } finally {
      setConfirmingBiometric(false);
    }
  };


  const handleHideBalanceToggle = async (enabled: boolean) => {
    setHideBalance(enabled);
    await AsyncStorage.setItem("hide_balance", String(enabled));
  };


  const handleDarkModeToggle = async (enabled: boolean) => {
    await setDarkMode(enabled);
    toast({ title: enabled ? "Dark Mode On" : "Dark Mode Off", description: enabled ? "Switched to dark theme" : "Switched to light theme" });
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (!user) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const kycLabels: Record<string, string> = {
    not_submitted: "Not verified", pending: "Under review", approved: "Verified", rejected: "Needs attention",
  };
  const kycStatusValue = kycStatus?.kycStatus || "not_submitted";
  const verified = kycStatusValue === "approved";

  const handleVerificationPress = () => {
    if (kycStatusValue === "pending") {
      toast({ title: "Under review", description: "We're checking your documents. This usually takes less than a day." });
      return;
    }
    if (verified) {
      toast({ title: "You're verified", description: "Your identity is confirmed. All features and higher limits are on." });
      return;
    }
    router.push({ pathname: "/(auth)/kyc-verification", params: { returnTo: "/(tabs)/profile" } } as any);
  };

  // Balances per currency (never added across currencies).
  const byCurrency = Object.entries(
    (cards || []).reduce((acc: Record<string, number>, c: any) => ({ ...acc, [c.currency]: (acc[c.currency] || 0) + parseFloat(c.balance || "0") }), {}),
  ) as [string, number][];

  const Row = ({ icon, tint, label, hint, onPress, right, danger }: {
    icon: string; tint: string; label: string; hint?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean;
  }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}
      accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label}>
      <View style={[styles.rowIcon, { backgroundColor: tint + (darkMode ? "33" : "1A") }]}>
        <Ionicons name={icon as any} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? "#EF4444" : colors.text }]}>{label}</Text>
        {!!hint && <Text style={[styles.rowHint, { color: colors.textMuted }]} numberOfLines={2}>{hint}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </TouchableOpacity>
  );
  const Toggle = ({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) => (
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor="#FFFFFF" accessibilityLabel={label} />
  );
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(Array.isArray(children) ? children : [children]).filter(Boolean).map((child, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );

  const statusChip = verified
    ? { icon: "shield-checkmark", text: "Verified", bg: "rgba(34,197,94,0.18)", fg: "#4ADE80" }
    : kycStatusValue === "pending"
      ? { icon: "time", text: "Under review", bg: "rgba(250,204,21,0.18)", fg: "#FACC15" }
      : { icon: "alert-circle", text: kycLabels[kycStatusValue] || "Not verified", bg: "rgba(248,113,113,0.18)", fg: "#FCA5A5" };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      {/* Identity */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroTitle}>Profile</Text>
          <TouchableOpacity style={styles.heroIconBtn} onPress={openEditModal} accessibilityLabel="Edit profile">
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.heroIdentity}>
          <TouchableOpacity onPress={() => setShowAvatarModal(true)} accessibilityLabel="Change photo"
            style={[styles.heroAvatar, { backgroundColor: isPhotoAvatar(user.avatar) ? "transparent" : (getAvatarColor(user.avatar) || "#0033CC") }]}>
            {isPhotoAvatar(user.avatar)
              ? <Image source={{ uri: user.avatar }} style={styles.heroAvatarPhoto} />
              : <Text style={styles.heroInitials}>{getInitials(user.name || user.username || "?")}</Text>}
            <View style={styles.heroAvatarBadge}><Ionicons name="camera" size={12} color="#010C38" /></View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.heroHandle} numberOfLines={1}>@{user.username}{user.accountType === "business" ? " · Business" : ""}</Text>
            <TouchableOpacity onPress={handleVerificationPress} style={[styles.statusChip, { backgroundColor: statusChip.bg }]}
              accessibilityLabel={`Identity: ${statusChip.text}`}>
              <Ionicons name={statusChip.icon as any} size={13} color={statusChip.fg} />
              <Text style={[styles.statusChipText, { color: statusChip.fg }]}>{statusChip.text}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.walletIdRow} onPress={copyWalletID} accessibilityLabel="Copy wallet ID">
          <View>
            <Text style={styles.walletIdLabel}>WALLET ID</Text>
            <Text style={styles.walletIdText}>{user.walletId}</Text>
          </View>
          <View style={styles.copyPill}>
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color="#FFFFFF" />
            <Text style={styles.copyPillText}>{copied ? "Copied" : "Copy"}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Balances per currency */}
      <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.balanceHead}>
          <Text style={[styles.groupTitle, { color: colors.textMuted, marginBottom: 0 }]}>BALANCES</Text>
          <TouchableOpacity onPress={() => handleHideBalanceToggle(!hideBalance)} accessibilityLabel={hideBalance ? "Show balances" : "Hide balances"}>
            <Ionicons name={hideBalance ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.balanceRow}>
          {(byCurrency.length ? byCurrency : [["ZAR", 0] as [string, number]]).map(([ccy, amt]) => (
            <View key={ccy} style={styles.balanceItem}>
              <Text style={[styles.balanceValue, { color: colors.text }]}>{hideBalance ? "••••" : `${amt.toFixed(2)}`}</Text>
              <Text style={[styles.balanceCcy, { color: colors.textMuted }]}>{ccy}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>{transactionCount} transactions</Text>
      </View>

      {/* Finish verification */}
      {!verified && (
        <TouchableOpacity onPress={handleVerificationPress} activeOpacity={0.85}
          style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: kycStatusValue === "rejected" ? "#EF4444" : colors.primary }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.primaryLight, width: 44, height: 44 }]}>
            <Ionicons name={kycStatusValue === "pending" ? "hourglass-outline" : "id-card-outline"} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {kycStatusValue === "pending" ? "We're checking your ID" : kycStatusValue === "rejected" ? "Please resubmit your ID" : "Verify your identity"}
            </Text>
            <Text style={[styles.rowHint, { color: colors.textMuted }]}>
              {kycStatusValue === "pending" ? "Usually under a day. We'll notify you." : "Unlock your Visa card, sending abroad and higher limits. Takes 2 minutes."}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: kycStatusValue === "pending" ? "75%" : "33%" }]} />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Shortcuts */}
      <View style={styles.tiles}>
        {([
          ["qr-code-outline", "My QR", "/(screens)/my-id", "#F59E0B"],
          ["card-outline", "Cards", "/(tabs)/wallet", "#0033CC"],
          ["stats-chart-outline", "Insights", "/(screens)/analytics", "#10B981"],
          ["chatbubbles-outline", "Help", "/(screens)/support-chat", "#8B5CF6"],
        ] as [string, string, string, string][]).map(([icon, label, href, tint]) => (
          <TouchableOpacity key={label} onPress={() => router.push(href as any)} accessibilityRole="button"
            style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: tint + (darkMode ? "33" : "1A") }]}><Ionicons name={icon as any} size={20} color={tint} /></View>
            <Text style={[styles.tileLabel, { color: colors.text }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Group title="ACCOUNT">
        <Row icon="person-outline" tint="#0033CC" label="Personal details" hint={[user.email, user.phone].filter(Boolean).join(" · ")} onPress={openEditModal} />
        <Row icon="id-card-outline" tint="#0EA5E9" label="Identity verification" hint={kycLabels[kycStatusValue] || kycStatusValue} onPress={handleVerificationPress}
          right={<View style={[styles.pill, { backgroundColor: verified ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)" }]}>
            <Text style={[styles.pillText, { color: verified ? "#16A34A" : "#B45309" }]}>{kycLabels[kycStatusValue]}</Text></View>} />
        {user.accountType === "business" && (
          <Row icon="briefcase-outline" tint="#059669" label="Business" hint="Verification, team and payouts" onPress={() => router.push("/(screens)/business" as any)} />
        )}
        <Row icon="gift-outline" tint="#F59E0B" label="Rewards" hint={loyaltyPoints ? `${loyaltyPoints} points` : "Earn as you pay"} onPress={() => router.push("/(screens)/loyalty" as any)} />
        <Row icon="receipt-outline" tint="#7C3AED" label="My plan" hint="Monthly fee and what's included" onPress={() => router.push("/(screens)/my-plan" as any)} />
        <Row icon="cash-outline" tint="#059669" label="Cash agents" hint="Deposit or withdraw cash at local shops" onPress={() => router.push("/(screens)/cash-agents" as any)} />
      </Group>

      <Group title="SECURITY">
        <Row icon="finger-print" tint="#10B981" label={biometricLabel}
          hint={biometricSupported ? "Sign in with your face or fingerprint" : "Not available on this device"}
          right={<Toggle value={biometricEnabled} onChange={handleBiometricToggle} disabled={!biometricSupported} label={biometricLabel} />} />
        <Row icon="keypad-outline" tint="#6366F1" label="PIN, limits and two-step sign-in" hint="Change your PIN, set spending limits" onPress={() => router.push("/(screens)/security-settings")} />
        <Row icon="notifications-outline" tint="#EF4444" label="Notifications" hint="Alerts, devices and lock-screen privacy" onPress={() => router.push("/(screens)/notification-settings" as any)} />
        <Row icon="trash-outline" tint="#DC2626" label="Delete account" hint="Close your account and delete your data" onPress={() => router.push("/(screens)/delete-account" as any)} />
      </Group>

      <Group title="PREFERENCES">
        <Row icon={darkMode ? "moon-outline" : "sunny-outline"} tint="#F59E0B" label="Dark mode"
          right={<Toggle value={darkMode} onChange={handleDarkModeToggle} label="Dark mode" />} />
        <Row icon={hideBalance ? "eye-off-outline" : "eye-outline"} tint="#0EA5E9" label="Hide balances" hint="Keep amounts private on screen"
          right={<Toggle value={hideBalance} onChange={handleHideBalanceToggle} label="Hide balances" />} />
        <Row icon="language-outline" tint="#8B5CF6" label="Language" hint={getCurrentLanguageName()} onPress={() => setShowLanguageModal(true)} />
        <Row icon="phone-portrait-outline" tint="#0033CC" label="Tap to pay" hint="Set up on each card in Cards" onPress={() => router.push("/(tabs)/wallet" as any)} />
      </Group>

      <Group title="SUPPORT">
        <Row icon="chatbubbles-outline" tint="#8B5CF6" label="Help and support" hint="Chat with our team" onPress={() => router.push("/(screens)/support-chat" as any)} />
        <Row icon="information-circle-outline" tint="#64748B" label="About BukkaPay" onPress={() => router.push("/(screens)/about" as any)} />
        <Row icon="document-text-outline" tint="#64748B" label="Terms and privacy" onPress={() => Linking.openURL("https://bukkapay.com/legal")} />
      </Group>

      <TouchableOpacity style={[styles.signOut, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handleLogout} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
      <Text style={[styles.footer, { color: colors.textMuted }]}>BukkaPay · Africa's money, without borders</Text>

      <Modal visible={showEditModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEditModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalField}>
              <View style={styles.modalLabelRow}>
                <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.modalLabel, { color: colors.text }]}>Full Name</Text>
              </View>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.modalField}>
              <View style={styles.modalLabelRow}>
                <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.modalLabel, { color: colors.text }]}>Phone Number</Text>
              </View>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, updateProfileMutation.isPending && styles.disabledButton]}
              onPress={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalCancelButton, { borderColor: colors.border }]} onPress={() => setShowEditModal(false)}>
              <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showBiometricPasswordModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowBiometricPasswordModal(false); setBiometricPassword(""); }}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Enable {biometricLabel}</Text>
              <TouchableOpacity onPress={() => { setShowBiometricPasswordModal(false); setBiometricPassword(""); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
              Confirm your password once — after that, your fingerprint or Face ID signs you in.
            </Text>

            <View style={styles.modalField}>
              <View style={styles.modalLabelRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.modalLabel, { color: colors.text }]}>Password</Text>
              </View>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                value={biometricPassword}
                onChangeText={setBiometricPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, (confirmingBiometric || !biometricPassword) && styles.disabledButton]}
              onPress={handleConfirmBiometricPassword}
              disabled={confirmingBiometric || !biometricPassword}
            >
              {confirmingBiometric ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Confirm & Enable</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelButton, { borderColor: colors.border }]}
              onPress={() => { setShowBiometricPasswordModal(false); setBiometricPassword(""); }}
            >
              <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showLanguageModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLanguageModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: "70%" }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Language & Region</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={styles.languageItem}
                  onPress={() => handleLanguageSelect(lang.code)}
                >
                  <View style={styles.languageItemLeft}>
                    <Text style={styles.languageFlag}>{lang.flag}</Text>
                    <Text style={[styles.languageName, { color: colors.text }]}>{lang.name}</Text>
                  </View>
                  {selectedLanguage === lang.code && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>


      <Modal visible={showAvatarModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAvatarModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Avatar</Text>
              <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.avatarDescription, { color: colors.textMuted }]}>Select a color for your profile avatar</Text>
            <View style={styles.avatarGrid}>
              {avatarOptions.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.avatarOption,
                    { backgroundColor: avatar.color },
                    user.avatar === avatar.id && styles.avatarSelected,
                  ]}
                  onPress={() => updateAvatarMutation.mutate(avatar.id)}
                  disabled={updateAvatarMutation.isPending}
                >
                  <Ionicons name="person" size={28} color="#FFFFFF" />
                  {user.avatar === avatar.id && (
                    <View style={styles.avatarCheckmark}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {updateAvatarMutation.isPending && (
              <ActivityIndicator size="small" color="#7C3AED" style={{ marginTop: 16 }} />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: "#010C38", paddingTop: 52, paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 18 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  heroIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroIdentity: { flexDirection: "row", alignItems: "center", gap: 16 },
  heroAvatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.25)" },
  heroAvatarPhoto: { width: 70, height: 70, borderRadius: 35 },
  heroInitials: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },
  heroAvatarBadge: { position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroName: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  heroHandle: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 2 },
  statusChip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  statusChipText: { fontSize: 12, fontWeight: "700" },
  walletIdRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 14 },
  walletIdLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  walletIdText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  copyPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0033CC", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  copyPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  balanceCard: { marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  balanceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 22 },
  balanceItem: { minWidth: 80 },
  balanceValue: { fontSize: 22, fontWeight: "800" },
  balanceCcy: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginTop: 2 },
  verifyCard: { flexDirection: "row", gap: 14, marginHorizontal: 20, marginTop: 14, borderWidth: 1.5, borderRadius: 20, padding: 16 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  tiles: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 14 },
  tile: { flex: 1, alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 18, paddingVertical: 14 },
  tileLabel: { fontSize: 12, fontWeight: "700" },
  group: { marginHorizontal: 20, marginTop: 22 },
  groupTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  groupCard: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, minHeight: 56 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowHint: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: "700" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, marginTop: 24, borderWidth: 1, borderRadius: 16, paddingVertical: 15 },
  signOutText: { color: "#EF4444", fontSize: 15, fontWeight: "700" },
  footer: { textAlign: "center", fontSize: 12, marginTop: 14, marginBottom: 8 },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentContainer: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  editButton: {
    padding: 8,
    borderRadius: 20,
  },
  profileCard: {
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: "#2563EB",
    borderRadius: 16,
    padding: 24,
  },
  profileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  avatarPhoto: {
    width: "100%",
    height: "100%",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  profileEmail: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  profileUsername: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  walletIdBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  copyButton: {
    padding: 8,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 32,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  statLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  settingsCard: {
    marginHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 24,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  settingSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 16,
  },
  loyaltyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 24,
    padding: 16,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 12,
    marginBottom: 24,
  },
  loyaltyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  loyaltySubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 24,
    padding: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    marginBottom: 32,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1A1A2E",
  },
  saveButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalCancelButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  languageItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  languageFlag: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  languageName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  avatarDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  avatarOption: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSelected: {
    borderWidth: 4,
    borderColor: "#7C3AED",
  },
  avatarCheckmark: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
});
