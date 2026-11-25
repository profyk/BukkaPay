/** Help & support: chat with an agent, email the help line, open a request,
 *  and follow every request to resolution. */
import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTicket, fetchTickets, STATUS_LABEL } from "../lib/support";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

const PRIMARY = "#7C3AED";
const CATEGORIES: [string, string][] = [
  ["payments", "A payment"], ["transfers", "Sending money"], ["cards", "My card"], ["account", "My account"],
  ["verification", "Verification"], ["fees", "Fees"], ["fraud", "Fraud or scam"], ["other", "Something else"],
];

export default function HelpCenter() {
  const router = useRouter();
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tickets"], queryFn: fetchTickets });
  const [form, setForm] = useState(false);
  const [category, setCategory] = useState("payments");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const email = data?.email ?? "support@bukkapay.com";

  const submit = async () => {
    setBusy(true);
    try {
      const t = await createTicket({ subject, category, message });
      setForm(false); setSubject(""); setMessage("");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast({ title: `Request ${t.reference} sent`, description: "We'll reply here and notify you." });
      router.push({ pathname: "/(screens)/help-ticket", params: { id: t.id } } as any);
    } catch (e: any) { toast({ title: "Not sent", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const Option = ({ icon, title, sub, onPress }: { icon: any; title: string; sub: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[st.option, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityRole="button">
      <View style={st.optIcon}><Ionicons name={icon} size={22} color={PRIMARY} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Help & support</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        <Option icon="chatbubbles-outline" title="Chat with us" sub="Talk to a person in the app" onPress={() => router.push("/(screens)/support-chat" as any)} />
        <Option icon="create-outline" title="Send a request" sub="Describe the problem; we reply here" onPress={() => setForm(!form)} />
        <Option icon="mail-outline" title="Email us" sub={email} onPress={() => Linking.openURL(`mailto:${email}`)} />

        {form && (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 10 }]}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>What's it about?</Text>
            <View style={st.chips}>
              {CATEGORIES.map(([v, l]) => (
                <TouchableOpacity key={v} onPress={() => setCategory(v)}
                  style={[st.chip, { borderColor: category === v ? PRIMARY : colors.border, backgroundColor: category === v ? PRIMARY : "transparent" }]}>
                  <Text style={{ color: category === v ? "#fff" : colors.text, fontWeight: "600", fontSize: 13 }}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={subject} onChangeText={setSubject} placeholder="Short summary" placeholderTextColor={colors.textMuted}
              style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Summary" />
            <TextInput value={message} onChangeText={setMessage} placeholder="Tell us what happened (amounts, dates, references help)" multiline
              placeholderTextColor={colors.textMuted} style={[st.input, { color: colors.text, borderColor: colors.border, minHeight: 110, textAlignVertical: "top" }]}
              accessibilityLabel="Message" />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Never share your PIN, password or one-time codes, not even with us.</Text>
            <TouchableOpacity style={[st.primary, (busy || subject.trim().length < 3 || message.trim().length < 2) && { opacity: 0.5 }]}
              disabled={busy || subject.trim().length < 3 || message.trim().length < 2} onPress={submit}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>Send request</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[st.section, { color: colors.textSecondary }]}>My requests</Text>
        {isLoading && <ActivityIndicator color={PRIMARY} />}
        {!isLoading && !data?.tickets.length && <Text style={{ color: colors.textMuted }}>No requests yet.</Text>}
        {data?.tickets.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => router.push({ pathname: "/(screens)/help-ticket", params: { id: t.id } } as any)}
            style={[st.ticket, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>{t.subject}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t.reference} · {new Date(t.updatedAt ?? t.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={[st.pill, { backgroundColor: t.status === "waiting_customer" ? "#FEF3C7" : t.status === "open" ? "#EDE9FE" : colors.surface }]}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: t.status === "waiting_customer" ? "#92400E" : t.status === "open" ? "#5B21B6" : colors.textSecondary }}>
                {STATUS_LABEL[t.status]}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  optIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  section: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 10 },
  ticket: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
