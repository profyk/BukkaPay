import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useToast } from "../hooks/use-toast";
import { signup } from "../lib/auth";
import { COUNTRY_CODES } from "../lib/countryData";
import { fetchOperatingCountries, type PublicCountry } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import SocialSignIn from "../components/SocialSignIn";
import EmailCodeModal from "../components/EmailCodeModal";

const logoImage = require("../assets/logo.png");

export default function Signup() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [loading, setLoading] = useState(false);
  // After sign-up we confirm the email with the code we just sent.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    phone: "",
    countryCode: "+27",
  });
  // Only countries where BukkaPay actually operates (from the API's
  // admin-controlled configuration) can be chosen as country of residence.
  const [countries, setCountries] = useState<PublicCountry[]>([]);
  const [residence, setResidence] = useState<string>("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  useEffect(() => {
    fetchOperatingCountries()
      .then((list) => {
        setCountries(list);
        if (list.length) {
          setResidence(list[0].code);
          if (list[0].dialCode) setFormData((prev) => ({ ...prev, countryCode: list[0].dialCode! }));
        }
      })
      .catch(() => setCountries([]));
  }, []);

  const updateField = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const selectedCountry = COUNTRY_CODES.find(c => c.code === formData.countryCode);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.username || !formData.password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Error", description: "Passwords don't match", variant: "destructive" });
      return;
    }

    if (formData.password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    if (!residence) {
      toast({ title: "Error", description: "Choose your country of residence", variant: "destructive" });
      return;
    }

    if (!acceptTerms) {
      toast({ title: "Error", description: "Please accept the Terms and Privacy Policy", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await signup(
        formData.email,
        formData.username,
        formData.password,
        formData.name,
        formData.phone,
        formData.countryCode,
        residence,
        acceptTerms,
      );
      // Next: confirm the email with the code, then identity verification.
      setConfirmEmail(formData.email.trim().toLowerCase());
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: darkMode ? colors.background : "#F5F3FF" }]} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.logoContainer}>
          <Image source={logoImage} style={styles.logoImage} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Join BukkaPay and manage your finances</Text>

        {/* A social sign-up still goes through KYC next, like an email sign-up. */}
        <SocialSignIn
          mode="signup"
          onSignedIn={() => router.replace({ pathname: "/(auth)/kyc-verification" as any, params: returnTo ? { returnTo } : {} })}
        />

        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ paddingHorizontal: 12, color: colors.textMuted, fontSize: 14 }}>or sign up with email</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Full Name</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={formData.name}
                onChangeText={(t) => updateField("name", t)}
                placeholder="Alex Morgan"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={formData.email}
                onChangeText={(t) => updateField("email", t)}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Username</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[styles.input, { color: colors.text, paddingLeft: 16 }]}
                value={formData.username}
                onChangeText={(t) => updateField("username", t)}
                placeholder="alex_morgan"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
            <View style={styles.phoneRow}>
              <TouchableOpacity style={[styles.countryCodeButton, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowCountryPicker(!showCountryPicker)}>
                <Text style={[styles.countryCodeText, { color: colors.text }]}>{selectedCountry?.flag} {formData.countryCode}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg, flex: 1 }]}>
                <Ionicons name="call-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={formData.phone}
                  onChangeText={(t) => updateField("phone", t)}
                  placeholder="1234567890"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            {showCountryPicker && (
              <ScrollView style={[styles.countryList, { borderColor: colors.border, backgroundColor: colors.card }]} nestedScrollEnabled>
                {COUNTRY_CODES.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.code}-${index}`}
                    style={[styles.countryItem, { borderBottomColor: colors.divider }]}
                    onPress={() => {
                      updateField("countryCode", item.code);
                      setShowCountryPicker(false);
                    }}
                  >
                    <Text style={[styles.countryItemText, { color: colors.text }]}>{item.flag} {item.country} ({item.code})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Selected: {selectedCountry?.flag} {selectedCountry?.country}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={formData.password}
                onChangeText={(t) => updateField("password", t)}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Confirm Password</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={formData.confirmPassword}
                onChangeText={(t) => updateField("confirmPassword", t)}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Country of residence</Text>
            {countries.length === 0 ? (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Loading available countries…</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {countries.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => {
                      setResidence(c.code);
                      if (c.dialCode) updateField("countryCode", c.dialCode);
                    }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                      borderColor: residence === c.code ? "#7C3AED" : colors.border,
                      backgroundColor: residence === c.code ? "#EDE9FE" : colors.surface,
                    }}
                  >
                    <Text style={{ color: residence === c.code ? "#5B21B6" : colors.text, fontWeight: "600" }}>
                      {c.name} · {c.currency}{c.status === "pilot" ? " (pilot)" : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[styles.helperText, { color: colors.textMuted }]}>
              BukkaPay is available only where we've launched with a licensed local partner.
            </Text>
          </View>

          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}
            onPress={() => setAcceptTerms(!acceptTerms)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptTerms }}
          >
            <Ionicons name={acceptTerms ? "checkbox" : "square-outline"} size={22} color={acceptTerms ? "#7C3AED" : colors.textMuted} />
            <Text style={{ color: colors.text, flex: 1 }}>I agree to the Terms of Service and Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signupButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signupButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.loginContainer}>
          <Text style={[styles.loginText, { color: colors.textMuted }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push({ pathname: "/(auth)/login" as any, params: returnTo ? { returnTo } : {} })}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.termsContainer, { borderTopColor: colors.border }]}>
          <Text style={[styles.termsText, { color: colors.textMuted }]}>By signing up, you agree to our Terms & Conditions</Text>
        </View>
      </View>
      <EmailCodeModal
        visible={confirmEmail !== null}
        email={confirmEmail ?? ""}
        onVerified={() => {
          setConfirmEmail(null);
          // Identity verification (KYC) is a required step of registration.
          router.replace({
            pathname: "/(auth)/kyc-verification" as any,
            params: returnTo ? { returnTo } : {},
          });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F3FF",
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
    marginBottom: 32,
  },
  form: {
    gap: 12,
  },
  fieldGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  inputIcon: {
    paddingLeft: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 16,
    color: "#1A1A2E",
  },
  eyeButton: {
    paddingRight: 12,
    paddingVertical: 14,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
  },
  countryCodeButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#F8F9FA",
    gap: 4,
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  countryList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
  },
  countryItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  countryItemText: {
    fontSize: 14,
    color: "#1A1A2E",
  },
  helperText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  signupButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  signupButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  loginText: {
    fontSize: 14,
    color: "#6B7280",
  },
  loginLink: {
    fontSize: 14,
    color: "#7C3AED",
    fontWeight: "600",
  },
  termsContainer: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    marginTop: 24,
    paddingTop: 24,
    alignItems: "center",
  },
  termsText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
});
