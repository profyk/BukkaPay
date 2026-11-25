/** Delete your BukkaPay account (Google Play / App Store requirement). */
import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "../lib/config";
import { getAuthHeader, logout } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";
import PinPrompt from "../components/PinPrompt";

const RED = "#DC2626";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(await getAuthHeader()) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data as T;
}

export default function DeleteAccount() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["closure-check"],
    queryFn: () => call<{ canClose: boolean; blockers: string[]; retentionYears: number; confirmWith: "pin" | "password" | "set_pin" }>("GET", "/api/account/closure-check"),
  });
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = async (pin?: string) => {
    await call("POST", "/api/account/close", { pin, password: pin ? undefined : password, confirm, reason: reason || undefined });
    setPinOpen(false);
    setDone(true);
    await logout();
    setTimeout(() => router.replace("/(auth)/login" as any), 2500);
  };

  if (done) {
    return (
      <View style={[st.container, st.center, { backgroundColor: colors.background }]}>
        <Ionicons name="checkmark-circle" size={64} color="#059669" />
        <Text style={[st.title, { color: colors.text }]}>Your account is closed</Text>
        <Text style={{ color: colors.textSecondary, textAlign: "center" }}>We've emailed you a confirmation. Thank you for using BukkaPay.</Text>
      </View>
    );
  }

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: RED }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Delete account</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[st.h, { color: colors.text }]}>What happens</Text>
          {[
            "Your account is closed straight away and you're signed out on every device.",
            "Your profile, photo, username, phone number, saved contacts, beneficiaries and devices are deleted.",
            "Your PIN, password, biometrics and Apple/Google sign-in links are removed.",
            `By law we must keep identity and transaction records for ${data?.retentionYears ?? 5} years. They're sealed, only our compliance team can see them, and they're deleted automatically after that.`,
            "This can't be undone. To use BukkaPay again you'd open a new account.",
          ].map((t) => (
            <View key={t} style={st.row}><Text style={{ color: colors.textSecondary }}>•</Text><Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{t}</Text></View>
          ))}
        </View>

        {isLoading && <ActivityIndicator color={RED} />}
        {data && !data.canClose && (
          <View style={[st.card, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <Text style={[st.h, { color: "#991B1B" }]}>Before you can delete</Text>
            {data.blockers.map((b) => <Text key={b} style={{ color: "#991B1B", marginTop: 4 }}>• {b}</Text>)}
            <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 10 }}><Text style={{ color: RED, fontWeight: "700" }}>Check again</Text></TouchableOpacity>
          </View>
        )}

        {data?.canClose && (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 10 }]}>
            <Text style={{ color: colors.textSecondary }}>Why are you leaving? (optional)</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="Tell us what we could do better" placeholderTextColor={colors.textMuted}
              style={[st.input, { color: colors.text, borderColor: colors.border }]} multiline />
            <Text style={{ color: colors.text, fontWeight: "700" }}>Type DELETE to confirm</Text>
            <TextInput value={confirm} onChangeText={setConfirm} autoCapitalize="characters" placeholder="DELETE" placeholderTextColor={colors.textMuted}
              style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Type DELETE to confirm" />
            {data.confirmWith === "password" && (
              <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" placeholderTextColor={colors.textMuted}
                style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Password" />
            )}
            {data.confirmWith === "set_pin" && (
              <TouchableOpacity onPress={() => router.push("/(screens)/security-settings" as any)}>
                <Text style={{ color: RED, fontWeight: "700" }}>Set a transaction PIN first (Security), then come back to delete your account.</Text>
              </TouchableOpacity>
            )}
            {!!error && <Text style={{ color: RED }}>{error}</Text>}
            <TouchableOpacity style={[st.danger, (confirm.trim().toUpperCase() !== "DELETE" || data.confirmWith === "set_pin" || (data.confirmWith === "password" && !password)) && { opacity: 0.4 }]}
              disabled={confirm.trim().toUpperCase() !== "DELETE" || data.confirmWith === "set_pin" || (data.confirmWith === "password" && !password)}
              onPress={async () => {
                setError("");
                if (data.confirmWith === "pin") { setPinOpen(true); return; }
                try { await close(); } catch (e: any) { setError(e.message); }
              }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Delete my account</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => Linking.openURL("https://www.bukkapay.com/legal/privacy-policy")}>
          <Text style={{ color: colors.textSecondary, textAlign: "center", textDecorationLine: "underline" }}>How we handle your data (Privacy Policy)</Text>
        </TouchableOpacity>
      </ScrollView>
      <PinPrompt visible={pinOpen} title="Confirm deletion" subtitle="Enter your PIN to delete your account" onCancel={() => setPinOpen(false)} onSubmit={close} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  h: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  danger: { backgroundColor: RED, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
});
