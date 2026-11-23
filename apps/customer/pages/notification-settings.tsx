/**
 * Notification settings: turn push on for this device, choose which alerts
 * to get, hide amounts on the lock screen, manage devices, send a test.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import {
  fetchPushDevices, fetchPushPreferences, removePushDevice, sendTestPush, updatePushPreferences,
  type PushDevice, type PushPreferences,
} from "../lib/api";
import { disablePush, enablePush, pushStatus, PUSH_HELP, type PushStatus } from "../lib/push";

const CATEGORIES: { key: keyof PushPreferences; icon: any; label: string; hint: string }[] = [
  { key: "money", icon: "swap-vertical", label: "Money in and out", hint: "Payments received, transfers, requests, payment links" },
  { key: "cards", icon: "card-outline", label: "Card payments", hint: "Every card payment, the moment it happens" },
  { key: "trade", icon: "boat-outline", label: "Trade and travel", hint: "Escrow updates, tickets and bookings" },
  { key: "support", icon: "chatbubbles-outline", label: "Support replies", hint: "When our team answers you" },
  { key: "updates", icon: "megaphone-outline", label: "News and offers", hint: "New features and promotions (occasionally)" },
];

const DEVICE_ICON: Record<string, any> = { ios: "phone-portrait-outline", android: "phone-portrait-outline", web: "desktop-outline" };

export default function NotificationSettings() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const checkStatus = useCallback(() => { pushStatus().then(setStatus); }, []);
  useEffect(() => {
    checkStatus();
    // Coming back from phone settings after allowing notifications.
    const sub = AppState.addEventListener("change", (s) => s === "active" && checkStatus());
    return () => sub.remove();
  }, [checkStatus]);

  const prefs = useQuery({ queryKey: ["push-preferences"], queryFn: fetchPushPreferences });
  const devices = useQuery({ queryKey: ["push-devices"], queryFn: fetchPushDevices });

  const save = useMutation({
    mutationFn: updatePushPreferences,
    onMutate: async (changes) => {
      const prev = qc.getQueryData<PushPreferences>(["push-preferences"]);
      if (prev) qc.setQueryData(["push-preferences"], { ...prev, ...changes });
      return { prev };
    },
    onError: (e: any, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(["push-preferences"], ctx.prev);
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    },
    onSuccess: (p) => qc.setQueryData(["push-preferences"], p),
  });

  const test = useMutation({
    mutationFn: sendTestPush,
    onSuccess: (r) => toast({ title: "Test sent", description: `Sent to ${r.delivered} device${r.delivered === 1 ? "" : "s"}. It should arrive in a few seconds.` }),
    onError: (e: any) => toast({ title: "Test failed", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removePushDevice({ id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["push-devices"] }); checkStatus(); },
  });

  const turnOn = async () => {
    setBusy(true);
    try {
      const s = await enablePush(true);
      setStatus(s);
      qc.invalidateQueries({ queryKey: ["push-devices"] });
      if (s === "on") toast({ title: "Notifications on", description: "You'll get instant alerts on this device." });
    } catch (e: any) {
      toast({ title: "Couldn't turn on notifications", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(); await checkStatus(); qc.invalidateQueries({ queryKey: ["push-devices"] }); }
    finally { setBusy(false); }
  };

  const on = status === "on";
  const hero = on ? { icon: "notifications", bg: "#DCFCE7", fg: "#15803D", title: "Notifications are on" }
    : status === "blocked" ? { icon: "notifications-off", bg: "#FEE2E2", fg: "#B91C1C", title: "Notifications are blocked" }
    : { icon: "notifications-outline", bg: colors.primaryLight, fg: colors.primary, title: "Get instant alerts" };

  return (
    <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.push("/notifications" as any))} style={st.back} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.title, { color: colors.text }]}>Notification settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={st.heroRow}>
          <View style={[st.heroIcon, { backgroundColor: hero.bg }]}><Ionicons name={hero.icon as any} size={26} color={hero.fg} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.panelTitle, { color: colors.text }]}>{hero.title}</Text>
            <Text style={[st.muted, { color: colors.textMuted }]}>{status ? PUSH_HELP[status] : "Checking this device…"}</Text>
          </View>
        </View>
        {status === null || busy ? <ActivityIndicator color={colors.primary} /> : on ? (
          <View style={st.btnRow}>
            <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary, flex: 1 }]} onPress={() => test.mutate()} disabled={test.isPending}>
              <Text style={st.btnText}>{test.isPending ? "Sending…" : "Send a test"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btn, st.btnGhost, { borderColor: colors.border }]} onPress={turnOff}>
              <Text style={[st.btnGhostText, { color: colors.text }]}>Turn off here</Text>
            </TouchableOpacity>
          </View>
        ) : status === "off" ? (
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={turnOn}>
            <Text style={st.btnText}>Turn on notifications</Text>
          </TouchableOpacity>
        ) : status === "blocked" && Platform.OS !== "web" ? (
          <TouchableOpacity style={[st.btn, { backgroundColor: colors.primary }]} onPress={() => Linking.openSettings()}>
            <Text style={st.btnText}>Open phone settings</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[st.section, { color: colors.textMuted }]}>WHAT TO SEND ME</Text>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border, gap: 4 }]}>
        <Row colors={colors} icon="shield-checkmark-outline" label="Security and account" hint="Sign-in, verification and account alerts. Always on to keep you safe.">
          <Ionicons name="lock-closed" size={18} color={colors.textMuted} accessibilityLabel="Always on" />
        </Row>
        {CATEGORIES.map((c) => (
          <Row key={c.key} colors={colors} icon={c.icon} label={c.label} hint={c.hint}>
            <Switch value={Boolean(prefs.data?.[c.key])} disabled={!prefs.data}
              onValueChange={(v) => save.mutate({ [c.key]: v })} trackColor={{ true: colors.primary }}
              accessibilityLabel={`${c.label} ${prefs.data?.[c.key] ? "on" : "off"}`} />
          </Row>
        ))}
        <Text style={[st.muted, { color: colors.textMuted, marginTop: 6 }]}>Everything still appears in your in-app inbox. These switches only control alerts.</Text>
      </View>

      <Text style={[st.section, { color: colors.textMuted }]}>PRIVACY</Text>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row colors={colors} icon="eye-off-outline" label="Show amounts on lock screen"
          hint={prefs.data?.showPreviews === false ? "Alerts say “New payment activity” until you open BukkaPay." : "Alerts show who paid and how much."}>
          <Switch value={prefs.data?.showPreviews ?? true} disabled={!prefs.data}
            onValueChange={(v) => save.mutate({ showPreviews: v })} trackColor={{ true: colors.primary }} accessibilityLabel="Show amounts on lock screen" />
        </Row>
      </View>

      <Text style={[st.section, { color: colors.textMuted }]}>DEVICES GETTING ALERTS</Text>
      <View style={[st.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {devices.isLoading ? <ActivityIndicator color={colors.primary} /> : (devices.data || []).length === 0 ? (
          <Text style={[st.muted, { color: colors.textMuted }]}>No devices yet. Turn notifications on above.</Text>
        ) : (devices.data || []).map((d: PushDevice) => (
          <View key={d.id} style={st.deviceRow}>
            <Ionicons name={DEVICE_ICON[d.platform]} size={22} color={d.active ? colors.primary : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[st.label, { color: colors.text }]}>{d.deviceName || (d.platform === "web" ? "Web browser" : "Phone")}</Text>
              <Text style={[st.muted, { color: colors.textMuted }]}>
                {d.active ? `Last active ${new Date(d.lastSeenAt).toLocaleDateString()}` : "Paused: we couldn't reach it"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => remove.mutate(d.id)} accessibilityLabel={`Remove ${d.deviceName || "device"}`} style={st.remove}>
              <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ colors, icon, label, hint, children }: { colors: any; icon: any; label: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={st.row}>
      <View style={[st.rowIcon, { backgroundColor: colors.primaryLight }]}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[st.label, { color: colors.text }]}>{label}</Text>
        <Text style={[st.muted, { color: colors.textMuted }]}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: Platform.OS === "ios" ? 56 : 44, paddingBottom: 8 },
  back: { padding: 8 },
  title: { fontSize: 18, fontWeight: "700" },
  panel: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginTop: 10, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 15, fontWeight: "600" },
  muted: { fontSize: 13, lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGhost: { borderWidth: 1 },
  btnGhostText: { fontWeight: "600" },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  remove: { padding: 4 },
});
