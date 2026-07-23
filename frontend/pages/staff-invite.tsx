import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

export default function StaffInvite() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { colors, darkMode } = useTheme();

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [businessName, setBusinessName] = useState<string | null>(null);

  const accept = async () => {
    if (!params.code) return;
    setStatus("loading");
    try {
      const headers = await getAuthHeader();
      if (!headers.Authorization) {
        setError("Log in to your BukkaPay account first, then open this link again.");
        setStatus("error");
        return;
      }
      const res = await fetch(`${API_BASE}/api/merchants/staff/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ inviteCode: params.code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "This invite link is no longer valid.");
      }
      setStatus("success");
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  };

  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const card = darkMode ? "#1A1A2E" : "#FFFFFF";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.card, { backgroundColor: card }]}>
        <View style={s.iconWrap}>
          <Ionicons name={status === "success" ? "checkmark-circle" : "people"} size={48} color={status === "success" ? "#10B981" : "#7C3AED"} />
        </View>

        {status !== "success" ? (
          <>
            <Text style={[s.title, { color: text }]}>Staff Invite</Text>
            <Text style={[s.subtitle, { color: sub }]}>
              You've been invited to manage a business on BukkaPay. Accept to link your account and get scoped
              access to their dashboard.
            </Text>
            {status === "error" && <Text style={s.errorText}>{error}</Text>}
            <TouchableOpacity style={s.primaryBtn} onPress={accept} disabled={status === "loading"}>
              {status === "loading" ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Accept Invite</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[s.title, { color: text }]}>You're in!</Text>
            <Text style={[s.subtitle, { color: sub }]}>You now have staff access to this business. It'll show up next time you open your merchant dashboard.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/(screens)/merchant-dashboard" as any)}>
              <Text style={s.primaryBtnText}>Open Dashboard</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 20, padding: 28, alignItems: "center" },
  iconWrap: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  errorText: { color: "#EF4444", fontSize: 13, textAlign: "center", marginBottom: 12 },
  primaryBtn: { backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
