/**
 * A gentle, dismissible card asking to turn on alerts. The system permission
 * dialog only appears after the person taps "Turn on", so they're never
 * ambushed by it (and a "no" there is hard to undo).
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import { enablePush, pushStatus } from "../lib/push";

const DISMISSED = "push_prompt_dismissed_at";
const SNOOZE_DAYS = 14;

export default function PushPrompt() {
  const { colors } = useTheme();
  const { toast } = useToast();
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      if ((await pushStatus()) !== "off") return;
      let at: string | null = null;
      try { at = await AsyncStorage.getItem(DISMISSED); } catch {}
      if (at && Date.now() - Number(at) < SNOOZE_DAYS * 86400000) return;
      setShow(true);
    })().catch(() => {});
  }, []);

  if (!show) return null;

  const dismiss = async () => {
    setShow(false);
    try { await AsyncStorage.setItem(DISMISSED, String(Date.now())); } catch {}
  };
  const turnOn = async () => {
    const s = await enablePush(true).catch(() => null);
    setShow(false);
    if (s === "on") toast({ title: "Notifications on", description: "We'll tell you the second money moves." });
    else await dismiss();
  };

  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[st.icon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="notifications" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.title, { color: colors.text }]}>Turn on payment alerts</Text>
        <Text style={[st.text, { color: colors.textMuted }]}>Know instantly when money arrives or your card is used.</Text>
        <View style={st.row}>
          <TouchableOpacity onPress={turnOn} style={[st.btn, { backgroundColor: colors.primary }]}>
            <Text style={st.btnText}>Turn on</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} style={st.later}>
            <Text style={[st.laterText, { color: colors.textMuted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700" },
  text: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 },
  btn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  later: { paddingVertical: 8 },
  laterText: { fontWeight: "600", fontSize: 13 },
});
