/**
 * Pop-up that confirms an email address with the 6-digit code we just sent.
 * Used after a new sign-up (and, later, when someone changes their email).
 * It is never a way to sign in: verified accounts use their password,
 * Google or Apple.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { requestOtp, verifyOtp } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

const RESEND_SECONDS = 60;

type Props = {
  visible: boolean;
  email: string;
  onVerified: () => void;
  onLater?: () => void;
};

export default function EmailCodeModal({ visible, email, onVerified, onLater }: Props) {
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [wait, setWait] = useState(RESEND_SECONDS);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setCode(""); setError(""); setInfo(""); setWait(RESEND_SECONDS);
    const t = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (!visible || wait <= 0) return;
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, [visible, wait > 0]);

  const submit = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true); setError("");
    try {
      await verifyOtp(email, value);
      onVerified();
    } catch (e: any) {
      setError(e?.message || "That code didn't work. Check it and try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (wait > 0) return;
    setError(""); setInfo("");
    try {
      await requestOtp(email);
      setInfo("A new code is on its way.");
      setWait(RESEND_SECONDS);
    } catch (e: any) {
      setError(e?.message || "Couldn't send a new code. Try again shortly.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={() => {}} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.icon}><Ionicons name="mail-open-outline" size={28} color="#7C3AED" /></View>
          <Text style={[styles.title, { color: colors.text }]}>Confirm your email</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            We sent a 6-digit code to <Text style={{ fontWeight: "700", color: colors.text }}>{email}</Text>. Enter it below.
          </Text>
          <TextInput
            ref={input}
            style={[styles.code, { color: colors.text, borderColor: error ? "#DC2626" : colors.border }]}
            value={code}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) submit(v);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="6-digit code"
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!info && <Text style={[styles.info, { color: colors.textMuted }]}>{info}</Text>}
          <TouchableOpacity style={[styles.primary, (code.length !== 6 || busy) && { opacity: 0.5 }]} disabled={code.length !== 6 || busy} onPress={() => submit()}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirm</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={resend} disabled={wait > 0} accessibilityRole="button">
            <Text style={[styles.link, { color: wait > 0 ? colors.textMuted : "#7C3AED" }]}>
              {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
            </Text>
          </TouchableOpacity>
          {onLater && (
            <TouchableOpacity onPress={onLater} accessibilityRole="button">
              <Text style={[styles.later, { color: colors.textMuted }]}>I'll do this later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 12 },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700" },
  sub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  code: { width: "100%", borderWidth: 1, borderRadius: 12, paddingVertical: 14, fontSize: 26, letterSpacing: 10, textAlign: "center", fontWeight: "700" },
  error: { color: "#DC2626", fontSize: 13, textAlign: "center" },
  info: { fontSize: 13, textAlign: "center" },
  primary: { width: "100%", backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  link: { fontSize: 14, fontWeight: "600", paddingVertical: 4 },
  later: { fontSize: 13, paddingVertical: 2 },
});
