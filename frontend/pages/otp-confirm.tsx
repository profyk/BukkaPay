import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/ThemeContext";

export default function OtpConfirm() {
  const router = useRouter();
  const { colors } = useTheme();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (otp.trim().length !== 6) {
      return;
    }

    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.replace("/(tabs)" as any);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Verify your login</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Enter the 6-digit code sent to your email or phone.</Text>

        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        />

        <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify OTP</Text>}
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
  secondaryText: { textAlign: "center", marginTop: 18, fontWeight: "600" },
});
