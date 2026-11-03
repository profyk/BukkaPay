import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";

const PURPLE = "#7C3AED";
const NUMPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

interface PinPromptProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<void> | void;
}

/**
 * Modal PIN entry used to authorize every payment/transfer in the app.
 * Server-side verification (pin_service.verify_pin) is the real gate —
 * this just collects the digits and surfaces the server's error message
 * (wrong PIN, locked out, no PIN set yet) inline instead of silently
 * failing.
 */
export default function PinPrompt({ visible, title = "Enter your PIN", subtitle, onCancel, onSubmit }: PinPromptProps) {
  const { colors } = useTheme();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) { setPin(""); setError(""); setSubmitting(false); }
  }, [visible]);

  const handleKey = (key: string) => {
    if (submitting) return;
    setError("");
    if (key === "del") { setPin((p) => p.slice(0, -1)); return; }
    if (key === "") return;
    if (pin.length >= 6) return;
    setPin((p) => p + key);
  };

  const handleSubmit = async (finalPin: string) => {
    setSubmitting(true);
    try {
      await onSubmit(finalPin);
    } catch (e: any) {
      setError(e.message || "Incorrect PIN");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (pin.length >= 4 && pin.length <= 6) {
      // Auto-submit once 4 digits are in, matching most banking-app PIN UX;
      // if it's wrong the user can keep typing up to 6 digits without this
      // re-firing on every keystroke.
      if (pin.length === 4 || pin.length === 6) {
        const t = setTimeout(() => handleSubmit(pin), 150);
        return () => clearTimeout(t);
      }
    }
  }, [pin]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={26} color={PURPLE} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}

          <View style={styles.dotsRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { borderColor: colors.border },
                  i < pin.length && { backgroundColor: PURPLE, borderColor: PURPLE },
                ]}
              />
            ))}
          </View>

          {submitting ? (
            <ActivityIndicator color={PURPLE} style={{ height: 20, marginBottom: 8 }} />
          ) : (
            <Text style={[styles.error, { opacity: error ? 1 : 0 }]}>{error || " "}</Text>
          )}

          <View style={styles.numpad}>
            {NUMPAD.map((key, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.key, key === "" && styles.keyHidden]}
                onPress={() => handleKey(key)}
                disabled={key === "" || submitting}
                activeOpacity={0.6}
              >
                {key === "del" ? (
                  <Ionicons name="backspace-outline" size={22} color={colors.text} />
                ) : (
                  <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} disabled={submitting}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    alignItems: "center",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", marginBottom: 16 },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: "center" },
  dotsRow: { flexDirection: "row", gap: 14, marginTop: 24, marginBottom: 10 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  error: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginBottom: 8, textAlign: "center" },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 260, justifyContent: "center", marginTop: 8 },
  key: {
    width: "33.33%", height: 62, alignItems: "center", justifyContent: "center",
  },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 24, fontWeight: "600" },
  cancelBtn: { marginTop: 12, padding: 8 },
  cancelText: { fontSize: 15, fontWeight: "600" },
});
