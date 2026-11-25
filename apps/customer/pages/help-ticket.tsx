/** One support request: the conversation, reply, mark solved, rate. */
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTicket, rateTicket, replyTicket, resolveTicket, STATUS_LABEL } from "../lib/support";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

const PRIMARY = "#7C3AED";

export default function HelpTicket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: t, isLoading } = useQuery({ queryKey: ["ticket", id], queryFn: () => fetchTicket(String(id)), refetchInterval: 15000 });
  const [reply, setReply] = useState("");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ticket", id] }); qc.invalidateQueries({ queryKey: ["tickets"] }); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); refresh(); toast({ title: ok }); } catch (e: any) { toast({ title: "Not done", description: e.message, variant: "destructive" }); }
  };

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>{t?.reference ?? "Request"}</Text>
        <View style={{ width: 40 }} />
      </View>
      {isLoading || !t ? <ActivityIndicator color={PRIMARY} style={{ marginTop: 32 }} /> : (
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{t.subject}</Text>
          <Text style={{ color: colors.textSecondary }}>{STATUS_LABEL[t.status]}</Text>
          {t.messages.map((m) => m.author === "system"
            ? <Text key={m.id} style={{ color: colors.textMuted, textAlign: "center", fontStyle: "italic", fontSize: 12 }}>{m.body}</Text>
            : (
              <View key={m.id} style={[st.bubble, m.author === "customer"
                ? { alignSelf: "flex-end", backgroundColor: PRIMARY }
                : { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 }]}>
                <Text style={{ color: m.author === "customer" ? "#fff" : colors.text, lineHeight: 20 }}>{m.body}</Text>
                <Text style={{ color: m.author === "customer" ? "rgba(255,255,255,0.7)" : colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  {m.author === "agent" ? "BukkaPay Support · " : ""}{new Date(m.createdAt).toLocaleString()}
                </Text>
              </View>
            ))}

          {t.status !== "closed" && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 8 }]}>
              <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply" multiline placeholderTextColor={colors.textMuted}
                style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Reply" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[st.primary, { flex: 1 }, !reply.trim() && { opacity: 0.5 }]} disabled={!reply.trim()}
                  onPress={() => act(() => replyTicket(t.id, reply).then(() => setReply("")), "Reply sent")}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Send</Text>
                </TouchableOpacity>
                {(t.status === "open" || t.status === "waiting_customer") && (
                  <TouchableOpacity style={[st.secondary, { borderColor: colors.border }]} onPress={() => act(() => resolveTicket(t.id), "Marked as solved")}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>It's solved</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {t.canRate && (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 8, alignItems: "center" }]}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>How did we do?</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setStars(n)} accessibilityLabel={`${n} stars`}>
                    <Ionicons name={n <= stars ? "star" : "star-outline"} size={32} color="#F59E0B" />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={comment} onChangeText={setComment} placeholder="Anything to add? (optional)" placeholderTextColor={colors.textMuted}
                style={[st.input, { color: colors.text, borderColor: colors.border, alignSelf: "stretch" }]} />
              <TouchableOpacity style={[st.primary, { alignSelf: "stretch" }, !stars && { opacity: 0.5 }]} disabled={!stars}
                onPress={() => act(() => rateTicket(t.id, stars, comment || undefined), "Thanks for your feedback")}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Send rating</Text>
              </TouchableOpacity>
            </View>
          )}
          {t.rating && <Text style={{ color: colors.textSecondary, textAlign: "center" }}>You rated this {"★".repeat(t.rating)}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  bubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 44 },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  secondary: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
});
