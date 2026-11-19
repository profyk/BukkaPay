/**
 * "Continue with Google" and "Continue with Apple", shown at the top of the
 * sign-in and sign-up screens, styled to each brand's published button
 * guidelines (Google: white or dark button with the four-colour "G";
 * Apple: black button with the Apple logo, or Apple's own native button on
 * iOS).
 *
 * Both providers return a signed ID token that the BukkaPay API verifies;
 * the app never decides who someone is. A brand-new account also needs a
 * country of residence and accepted terms, asked for in a small sheet.
 *
 * Configuration (EAS / .env):
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  (Google Cloud OAuth clients)
 *   EXPO_PUBLIC_APPLE_SERVICES_ID         (Apple Services ID, web only)
 * Apple on iOS needs only the "Sign in with Apple" capability.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { socialSignIn, type SocialSignInBody } from "../lib/auth";
import { fetchOperatingCountries, type PublicCountry } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
const APPLE_SERVICES_ID = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID;

const googleConfigured =
  Platform.OS === "ios" ? !!GOOGLE.iosClientId : Platform.OS === "android" ? !!GOOGLE.androidClientId : !!GOOGLE.webClientId;

type Props = { onSignedIn: () => void; mode?: "signin" | "signup" };

export default function SocialSignIn({ onSignedIn, mode = "signin" }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | "google" | "apple">(null);
  const [pending, setPending] = useState<SocialSignInBody | null>(null);
  const [appleNative, setAppleNative] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleNative).catch(() => {});
  }, []);

  const finish = async (body: SocialSignInBody) => {
    const result = await socialSignIn(body);
    if (result.status === "needs_profile") setPending(body);
    else onSignedIn();
  };

  const fail = (provider: string, e: any) => {
    const msg = String(e?.message ?? e ?? "");
    if (/cancel/i.test(msg) || e?.code === "ERR_REQUEST_CANCELED") return;
    toast({ title: `${provider} sign-in failed`, description: msg || "Please try again", variant: "destructive" });
  };

  const signInWithApple = async () => {
    setBusy("apple");
    try {
      const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      let identityToken: string | null = null;
      let name: string | undefined;
      if (Platform.OS === "ios") {
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashed,
        });
        identityToken = cred.identityToken;
        name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ") || undefined;
      } else {
        const res = await appleWebSignIn(hashed);
        identityToken = res.idToken;
        name = res.name;
      }
      if (!identityToken) throw new Error("Apple didn't return an identity token");
      await finish({ provider: "apple", identityToken, nonce: rawNonce, name });
    } catch (e) {
      fail("Apple", e);
    } finally {
      setBusy(null);
    }
  };

  const showApple = Platform.OS === "ios" ? appleNative : Platform.OS === "web" && !!APPLE_SERVICES_ID;
  const label = mode === "signup" ? "Sign up" : "Continue";

  return (
    <View style={styles.wrap}>
      {googleConfigured ? (
        <GoogleButtonLive
          label={`${label} with Google`}
          busy={busy === "google"}
          setBusy={(b) => setBusy(b ? "google" : null)}
          onToken={(idToken) => finish({ provider: "google", idToken }).catch((e) => fail("Google", e))}
          onError={(e) => fail("Google", e)}
        />
      ) : (
        <GoogleButton
          label={`${label} with Google`}
          onPress={() => toast({ title: "Google sign-in", description: "Google sign-in isn't switched on for this build yet." })}
        />
      )}

      {showApple && (Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={mode === "signup"
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleNative}
          onPress={signInWithApple}
        />
      ) : (
        <TouchableOpacity
          style={styles.appleBtn}
          onPress={signInWithApple}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={`${label} with Apple`}
        >
          {busy === "apple" ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              <Text style={styles.appleText}>{label} with Apple</Text>
            </>
          )}
        </TouchableOpacity>
      ))}

      <CompleteProfileSheet
        visible={pending !== null}
        onCancel={() => setPending(null)}
        onSubmit={async ({ residenceCountry, username, phone }) => {
          if (!pending) return;
          const result = await socialSignIn(pending, { residenceCountry, acceptTerms: true, username, phone });
          if (result.status === "signed_in") {
            setPending(null);
            onSignedIn();
          }
        }}
      />
    </View>
  );
}

function GoogleButtonLive({ label, busy, setBusy, onToken, onError }: {
  label: string; busy: boolean; setBusy: (b: boolean) => void;
  onToken: (idToken: string) => Promise<void> | void; onError: (e: any) => void;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE.webClientId,
    iosClientId: GOOGLE.iosClientId,
    androidClientId: GOOGLE.androidClientId,
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (idToken) Promise.resolve(onToken(idToken)).finally(() => setBusy(false));
      else { setBusy(false); onError(new Error("Google didn't return an ID token")); }
    } else {
      setBusy(false);
      if (response.type === "error") onError(response.error ?? new Error("Google sign-in failed"));
    }
  }, [response]);

  return (
    <GoogleButton
      label={label}
      busy={busy}
      disabled={!request || busy}
      onPress={() => { setBusy(true); promptAsync().catch((e) => { setBusy(false); onError(e); }); }}
    />
  );
}

function GoogleButton({ label, onPress, busy, disabled }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
}) {
  const { darkMode } = useTheme();
  // Google's sign-in button palette: light #FFFFFF / #747775 / #1F1F1F,
  // dark #131314 / #8E918F / #E3E3E3.
  const palette = darkMode
    ? { bg: "#131314", border: "#8E918F", text: "#E3E3E3" }
    : { bg: "#FFFFFF", border: "#747775", text: "#1F1F1F" };
  return (
    <TouchableOpacity
      style={[styles.googleBtn, { backgroundColor: palette.bg, borderColor: palette.border }, disabled && !busy && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator color={palette.text} /> : (
        <>
          <GoogleG />
          <Text style={[styles.googleText, { color: palette.text }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** Web: Apple's JS SDK in popup mode returns the identity token directly. */
async function appleWebSignIn(hashedNonce: string): Promise<{ idToken: string; name?: string }> {
  const w = globalThis as any;
  if (!w.AppleID) {
    await new Promise<void>((resolve, reject) => {
      const s = w.document.createElement("script");
      s.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn't load Sign in with Apple"));
      w.document.head.appendChild(s);
    });
  }
  w.AppleID.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: "name email",
    redirectURI: w.location.origin,
    usePopup: true,
    nonce: hashedNonce,
  });
  const res = await w.AppleID.auth.signIn();
  const n = res?.user?.name;
  return {
    idToken: res?.authorization?.id_token,
    name: n ? [n.firstName, n.lastName].filter(Boolean).join(" ") : undefined,
  };
}

function CompleteProfileSheet({ visible, onCancel, onSubmit }: {
  visible: boolean; onCancel: () => void;
  onSubmit: (profile: { residenceCountry: string; username: string; phone: string }) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const [countries, setCountries] = useState<PublicCountry[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const usernameOk = /^[A-Za-z0-9._]{3,30}$/.test(username.trim().replace(/^@/, ""));
  const phoneOk = phone.replace(/\D/g, "").length >= 6;
  const ready = !!country && accepted && usernameOk && phoneOk;
  const dial = countries.find((c) => c.code === country)?.dialCode;

  useEffect(() => {
    if (!visible) return;
    fetchOperatingCountries()
      .then((list) => { setCountries(list); if (list.length === 1) setCountry(list[0].code); })
      .catch(() => toast({ title: "Couldn't load countries", description: "Check your connection and try again", variant: "destructive" }));
  }, [visible]);

  const submit = async () => {
    if (!ready || !country) return;
    setSaving(true);
    try {
      await onSubmit({ residenceCountry: country, username: username.trim().replace(/^@/, ""), phone });
    } catch (e: any) {
      toast({ title: "Couldn't create your account", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>One last step</Text>
        <Text style={[styles.label, { color: colors.text }]}>Username</Text>
        <TextInput
          style={[styles.field, { color: colors.text, borderColor: colors.border }]}
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. ama.mensah"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Username"
        />
        {username.length > 0 && !usernameOk && (
          <Text style={styles.hint}>3–30 letters, numbers, dots or underscores</Text>
        )}
        <Text style={[styles.label, { color: colors.text }]}>Phone number</Text>
        <View style={styles.phoneRow}>
          {!!dial && <Text style={[styles.dial, { color: colors.text, borderColor: colors.border }]}>{dial}</Text>}
          <TextInput
            style={[styles.field, { color: colors.text, borderColor: colors.border, flex: 1 }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="82 123 4567"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            accessibilityLabel="Phone number"
          />
        </View>
        <Text style={[styles.sheetSub, { color: colors.textMuted }]}>Where do you live? Your wallet opens in that country's currency.</Text>
        <ScrollView style={{ maxHeight: 200 }}>
          {countries.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.countryRow, { borderColor: country === c.code ? "#7C3AED" : colors.border }]}
              onPress={() => setCountry(c.code)}
              accessibilityState={{ selected: country === c.code }}
            >
              <Text style={{ color: colors.text, flex: 1 }}>{c.name}</Text>
              <Text style={{ color: colors.textMuted }}>{c.currency}</Text>
              {country === c.code && <Ionicons name="checkmark-circle" size={20} color="#7C3AED" style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.termsRow} onPress={() => setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}>
          <Ionicons name={accepted ? "checkbox" : "square-outline"} size={22} color={accepted ? "#7C3AED" : colors.textMuted} />
          <Text style={{ color: colors.text, flex: 1 }}>I agree to the Terms of Service and Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primary, (!ready || saving) && { opacity: 0.5 }]}
          disabled={!ready || saving}
          onPress={submit}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Create my account</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 4 },
  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, height: 50, paddingHorizontal: 16,
  },
  googleText: { fontSize: 15, fontWeight: "600", letterSpacing: 0.25 },
  appleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#000000", borderRadius: 12, height: 50, paddingHorizontal: 16,
  },
  appleText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  appleNative: { width: "100%", height: 50 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700" },
  sheetSub: { fontSize: 14, marginBottom: 4 },
  countryRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600" },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  hint: { color: "#DC2626", fontSize: 12, marginTop: -6 },
  phoneRow: { flexDirection: "row", gap: 8 },
  dial: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  termsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  primary: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
