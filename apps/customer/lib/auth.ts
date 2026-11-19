import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

export interface User {
  id: number;
  email: string;
  username: string;
  name: string;
  phone?: string | null;
  walletId?: string | null;
  loyaltyPoints?: number;
  avatarColor?: string | null;
  language?: string | null;
  countryCode?: string | null;
  createdAt?: string | null;
}

const AUTH_TOKEN = "bukkapay_token";
const CURRENT_USER = "bukkapay_user";
const BIOMETRIC_ENABLED = "bukkapay_biometric_enabled";
const BIOMETRIC_CREDENTIALS = "bukkapay_biometric_creds";

type AuthListener = () => void;
const listeners: AuthListener[] = [];

export const authEvents = {
  on(_event: string, fn: AuthListener) {
    listeners.push(fn);
  },
  off(_event: string, fn: AuthListener) {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },
  emit(_event: string) {
    listeners.forEach((fn) => fn());
  },
};

export async function setAuthToken(token: string) {
  await AsyncStorage.setItem(AUTH_TOKEN, token);
}

export async function setAuth(token: string, user: User) {
  await setAuthToken(token);
  await setCurrentUser(user);
}

export async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem(AUTH_TOKEN);
}

export async function clearAuthToken() {
  await AsyncStorage.removeItem(AUTH_TOKEN);
  await AsyncStorage.removeItem(CURRENT_USER);
  authEvents.emit("authStateChanged");
}

export async function setCurrentUser(user: User) {
  await AsyncStorage.setItem(CURRENT_USER, JSON.stringify(user));
  authEvents.emit("authStateChanged");
}

export async function getCurrentUser(): Promise<User | null> {
  const user = await AsyncStorage.getItem(CURRENT_USER);
  return user ? JSON.parse(user) : null;
}

export async function signup(
  email: string, username: string, password: string, name: string, phone: string | undefined,
  countryCode: string | undefined, residenceCountry: string, acceptTerms: boolean, preferredLanguage = "en",
) {
  const res = await fetch(API_BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password, name, phone, countryCode, residenceCountry, acceptTerms, preferredLanguage }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Signup failed");
  }

  const data = await res.json();
  await setAuthToken(data.token);
  await setCurrentUser(data.user);
  return data;
}

export async function login(email: string, password: string) {
  const res = await fetch(API_BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Login failed");
  }

  const data = await res.json();
  await setAuthToken(data.token);
  await setCurrentUser(data.user);
  return data;
}

export async function logout() {
  const token = await getAuthToken();
  if (token) {
    try {
      await fetch(API_BASE + "/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Logout error:", e);
    }
  }
  await clearAuthToken();
}

export async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getBiometricType(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "Face ID";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "Fingerprint";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "Iris";
  }
  return "Biometric";
}

export async function authenticateWithBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Sign in to BukkaPay",
    fallbackLabel: "Use password",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function enableBiometricLogin(email: string, password: string) {
  // Credentials are the keys to the account, so they go in the Keychain/
  // Keystore (via SecureStore) rather than AsyncStorage, which is plain
  // unencrypted storage on both platforms. A blank password would silently
  // brick biometric sign-in later (login() would always be rejected), so
  // refuse to save one — callers must confirm the real password first.
  if (!password) throw new Error("A password is required to enable biometric login");
  await AsyncStorage.setItem(BIOMETRIC_ENABLED, "true");
  await SecureStore.setItemAsync(BIOMETRIC_CREDENTIALS, JSON.stringify({ email, password }));
}

export async function disableBiometricLogin() {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED, "false");
  await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS);
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED);
  return val === "true";
}

export async function biometricLogin(): Promise<any> {
  const credsStr = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS);
  if (!credsStr) throw new Error("No saved credentials");

  const authenticated = await authenticateWithBiometric();
  if (!authenticated) throw new Error("Biometric authentication failed");

  const { email, password } = JSON.parse(credsStr);
  return login(email, password);
}

export type SocialProvider = "google" | "apple";

export type SocialSignInBody =
  | { provider: "google"; idToken: string; name?: string }
  | { provider: "apple"; identityToken: string; nonce: string; name?: string };

export type SocialSignInResult = { status: "signed_in"; data: any } | { status: "needs_profile" };

/** Exchange a Google or Apple ID token for a BukkaPay session. A brand-new
 * account first needs a country of residence and accepted terms; the API
 * answers 428 for that and the caller retries with `profile` filled in. */
export async function socialSignIn(
  body: SocialSignInBody,
  profile?: { residenceCountry: string; acceptTerms: boolean; username: string; phone: string },
): Promise<SocialSignInResult> {
  const { provider, ...rest } = body;
  const res = await fetch(API_BASE + `/api/auth/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, ...(profile ?? {}) }),
  });
  if (res.status === 428) return { status: "needs_profile" };
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `${provider === "google" ? "Google" : "Apple"} sign-in failed`);
  }
  const data = await res.json();
  await setAuthToken(data.token);
  await setCurrentUser(data.user);
  return { status: "signed_in", data };
}

export async function requestOtp(email: string) {
  const res = await fetch(API_BASE + "/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "OTP request failed");
  }

  return await res.json();
}

export async function verifyOtp(email: string, code: string) {
  const res = await fetch(API_BASE + "/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "OTP verification failed");
  }

  // A verified email code confirms the address and signs the customer in.
  const data = await res.json();
  if (data.token) {
    await setAuthToken(data.token);
    await setCurrentUser(data.user);
  }
  return data;
}
