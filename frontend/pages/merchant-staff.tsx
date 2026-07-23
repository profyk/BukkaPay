import { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, Modal, Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE, APP_URL } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

interface Merchant { id: string; businessName: string; }
interface Staff {
  id: string;
  name: string;
  role: "manager" | "cashier";
  status: "pending" | "active" | "removed";
  inviteCode?: string;
  createdAt: string;
}

const confirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === "web") { if (window.confirm(`${title}\n\n${message}`)) onConfirm(); return; }
  const { Alert } = require("react-native");
  Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: onConfirm }]);
};

export default function MerchantStaff() {
  const router = useRouter();
  const params = useLocalSearchParams<{ merchantId?: string }>();
  const { colors, darkMode } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: merchants = [] } = useQuery<Merchant[]>({ queryKey: ["/api/merchants"] });
  const merchant = merchants.find(m => m.id === params.merchantId) || merchants[0];

  const { data: staff = [], isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/merchants", merchant?.id, "staff"],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}/staff`, { headers: await getAuthHeader() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "cashier">("cashier");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ name: inviteName.trim(), role: inviteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not create invite"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      setInviteLink(data.inviteLink);
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchant?.id, "staff"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const removeMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}/staff/${staffId}`, {
        method: "DELETE", headers: await getAuthHeader(),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not remove staff member"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchant?.id, "staff"] });
      toast({ title: "Removed", description: "Staff access revoked." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ staffId, role }: { staffId: string; role: string }) => {
      const res = await fetch(`${API_BASE}/api/merchants/${merchant?.id}/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Could not update role"); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchant?.id, "staff"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const closeInvite = () => { setShowInvite(false); setInviteName(""); setInviteRole("cashier"); setInviteLink(null); };

  const copyLink = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    toast({ title: "Copied", description: "Invite link copied to clipboard." });
  };

  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const card = darkMode ? "#1A1A2E" : "#FFFFFF";
  const border = darkMode ? "#2D2D44" : "#E5E7EB";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";

  const activeStaff = staff.filter(s => s.status !== "removed");

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <View style={[st.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: text }]}>Staff</Text>
        <TouchableOpacity onPress={() => setShowInvite(true)}>
          <Ionicons name="person-add" size={22} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={[st.subtitle, { color: sub }]}>
          Invite staff to help run {merchant?.businessName || "your business"} — managers can add other staff, cashiers can view sales and print QR slips only.
        </Text>

        {isLoading && <ActivityIndicator color="#7C3AED" style={{ marginTop: 20 }} />}

        {!isLoading && activeStaff.length === 0 && (
          <View style={[st.emptyState, { backgroundColor: card, borderColor: border }]}>
            <Ionicons name="people-outline" size={36} color={sub} />
            <Text style={[st.emptyText, { color: sub }]}>No staff yet. Tap + to invite your first team member.</Text>
          </View>
        )}

        {activeStaff.map(m => (
          <View key={m.id} style={[st.staffCard, { backgroundColor: card, borderColor: border }]}>
            <View style={[st.staffAvatar, { backgroundColor: m.role === "manager" ? "#7C3AED20" : "#3B82F620" }]}>
              <Ionicons name={m.role === "manager" ? "shield" : "person"} size={18} color={m.role === "manager" ? "#7C3AED" : "#3B82F6"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.staffName, { color: text }]}>{m.name}</Text>
              <Text style={[st.staffMeta, { color: sub }]}>
                {m.role === "manager" ? "Manager" : "Cashier"} · {m.status === "pending" ? "Invite not yet accepted" : "Active"}
              </Text>
            </View>
            <TouchableOpacity
              style={st.roleToggle}
              onPress={() => roleMutation.mutate({ staffId: m.id, role: m.role === "manager" ? "cashier" : "manager" })}
            >
              <Text style={{ color: "#7C3AED", fontSize: 12, fontWeight: "700" }}>
                {m.role === "manager" ? "Make Cashier" : "Make Manager"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirm("Remove Staff", `Revoke ${m.name}'s access to this business?`, () => removeMutation.mutate(m.id))}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showInvite} transparent animationType="slide" onRequestClose={closeInvite}>
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: card }]}>
            <View style={[st.handle, { backgroundColor: border }]} />
            <Text style={[st.sheetTitle, { color: text }]}>Invite Staff Member</Text>

            {!inviteLink ? (
              <>
                <Text style={[st.fieldLabel, { color: text }]}>Name</Text>
                <TextInput
                  style={[st.input, { backgroundColor: bg, borderColor: border, color: text }]}
                  value={inviteName} onChangeText={setInviteName} placeholder="e.g. Thabo M." placeholderTextColor={sub}
                />
                <Text style={[st.fieldLabel, { color: text }]}>Role</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {(["cashier", "manager"] as const).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[st.roleChip, { backgroundColor: bg, borderColor: inviteRole === r ? "#7C3AED" : border }]}
                      onPress={() => setInviteRole(r)}
                    >
                      <Text style={{ color: inviteRole === r ? "#7C3AED" : sub, fontWeight: "700", fontSize: 13 }}>
                        {r === "cashier" ? "Cashier — view & print only" : "Manager — can also manage staff"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[st.primaryBtn, (!inviteName.trim() || inviteMutation.isPending) && { opacity: 0.5 }]}
                  onPress={() => inviteMutation.mutate()}
                  disabled={!inviteName.trim() || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>Generate Invite Link</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={40} color="#10B981" style={{ alignSelf: "center", marginBottom: 8 }} />
                <Text style={[st.linkHint, { color: sub }]}>Share this link with {inviteName} — opening it links their BukkaPay account to this business.</Text>
                <View style={[st.linkBox, { backgroundColor: bg, borderColor: border }]}>
                  <Text style={{ color: text, fontSize: 12 }} numberOfLines={1}>{inviteLink}</Text>
                </View>
                <TouchableOpacity style={st.primaryBtn} onPress={copyLink}>
                  <Ionicons name="copy" size={16} color="#fff" />
                  <Text style={st.primaryBtnText}> Copy Link</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={{ alignItems: "center", marginTop: 14 }} onPress={closeInvite}>
              <Text style={{ color: sub, fontSize: 13 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 48, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  emptyState: { borderRadius: 16, borderWidth: 1, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 13, textAlign: "center" },
  staffCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  staffAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  staffName: { fontSize: 14, fontWeight: "700" },
  staffMeta: { fontSize: 12, marginTop: 2 },
  roleToggle: { paddingHorizontal: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: "800", marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 14 },
  roleChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 12 },
  primaryBtn: { flexDirection: "row", backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkHint: { fontSize: 12.5, textAlign: "center", lineHeight: 18, marginBottom: 12 },
  linkBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
