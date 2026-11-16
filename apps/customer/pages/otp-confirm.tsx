import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";
import { requestOtp, verifyOtp } from "../lib/auth";

export default function OtpConfirm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { colors } = useTheme();
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState(params.email || "");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleRequestOtp = async () => {
    if (!email.trim()) return setError("Enter your email address");
    setError("");
    setSending(true);
    try {
      await requestOtp(email.trim());
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Couldn't send the code");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!email.trim() || otp.trim().length !== 6) return setError("Enter the 6-digit code from the email");
    setError("");
    setLoading(true);
    try {
      await verifyOtp(email.trim(), otp.trim());
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      setError(e.message || "That code didn't work");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Sign in with a code</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {sent ? `We emailed a 6-digit code to ${email.trim()}.` : "We'll email you a 6-digit code."}
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginBottom: 12 }]}
        />

        <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.primaryLight }]} onPress={handleRequestOtp} disabled={sending}>
          {sending ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.secondaryText, { color: colors.primary }]}>{sent ? "Send a new code" : "Email me a code"}</Text>}
        </TouchableOpacity>

        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        />

        {!!error && <Text style={{ color: "#DC2626", marginTop: 10 }}>{error}</Text>}

        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify and sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.secondaryText, { color: colors.primary }]}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  card: { width: "100%", maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, letterSpacing: 6, marginBottom: 18 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  secondaryText: { textAlign: "center", marginTop: 18, fontWeight: "600" },
});
