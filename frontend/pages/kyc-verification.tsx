import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useToast } from "../hooks/use-toast";
import { getCurrentUser } from "../lib/auth";
import { submitKyc } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";

const DOCUMENT_TYPES: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "national_id", label: "National ID", icon: "card-outline" },
  { value: "passport", label: "Passport", icon: "book-outline" },
  { value: "driver_license", label: "Driver's License", icon: "car-outline" },
];

export default function KycVerification() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const [fullName, setFullName] = useState("");
  const [documentType, setDocumentType] = useState("national_id");
  const [documentNumber, setDocumentNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setFullName(user.name);
    })();
  }, []);

  const handleSubmit = async () => {
    if (!fullName.trim() || !documentNumber.trim()) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await submitKyc(fullName.trim(), documentType, documentNumber.trim());
      toast({ title: "Verification submitted", description: "We'll review your details shortly." });
      router.replace((returnTo || "/(tabs)") as any);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? colors.background : "#F5F3FF" }]} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Verify Your Identity</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          BukkaPay requires identity verification (KYC) to protect your account and comply with financial
          regulations. This only takes a minute.
        </Text>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Full Legal Name</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="As it appears on your ID"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Document Type</Text>
            <View style={styles.docTypeRow}>
              {DOCUMENT_TYPES.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[
                    styles.docTypeOption,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    documentType === d.value && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => setDocumentType(d.value)}
                >
                  <Ionicons name={d.icon} size={20} color={documentType === d.value ? colors.primary : colors.textMuted} />
                  <Text style={[styles.docTypeLabel, { color: colors.textMuted }, documentType === d.value && { color: colors.primary }]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Document Number</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={documentNumber}
                onChangeText={setDocumentNumber}
                placeholder="Enter the document number"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit for Verification</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.securityRow, { borderTopColor: colors.border }]}>
          <Ionicons name="lock-closed" size={14} color="#10B981" />
          <Text style={[styles.securityText, { color: colors.textMuted }]}>Your information is encrypted and only used for verification</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3FF" },
  contentContainer: { flexGrow: 1, justifyContent: "center", padding: 16 },
  card: {
    backgroundColor: "#FFFFFF", borderRadius: 24, padding: 32,
    borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8,
  },
  iconWrap: {
    alignSelf: "center", width: 64, height: 64, borderRadius: 20,
    backgroundColor: "#F4F3FF", alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", color: "#1A1A2E", marginBottom: 8 },
  subtitle: { textAlign: "center", color: "#6B7280", fontSize: 13, lineHeight: 20, marginBottom: 28 },
  form: { gap: 12 },
  fieldGroup: { marginBottom: 4 },
  label: { fontSize: 14, fontWeight: "500", color: "#1A1A2E", marginBottom: 8 },
  inputContainer: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FFFFFF",
  },
  inputIcon: { paddingLeft: 12 },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 16, color: "#1A1A2E" },
  docTypeRow: { flexDirection: "row", gap: 8 },
  docTypeOption: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#FAFAFE",
  },
  docTypeOptionActive: { borderColor: "#7C3AED", backgroundColor: "#F4F3FF" },
  docTypeLabel: { fontSize: 11, fontWeight: "600", color: "#6B7280", textAlign: "center" },
  docTypeLabelActive: { color: "#7C3AED" },
  submitButton: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  securityRow: {
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
    marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: "#E5E7EB",
  },
  securityText: { fontSize: 12, color: "#6B7280", flexShrink: 1, textAlign: "center" },
});
