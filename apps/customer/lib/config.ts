// config.ts
import Constants from "expo-constants";

/**
 * API_BASE:
 * Priority:
 * 1. EXPO_PUBLIC_API_URL from environment (.env)
 * 2. backendUrl from app.json extra (used in EAS / Expo builds)
 * 3. Default to BukkaPay API domain
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.backendUrl ||
  "https://api.bukkapay.com";

/**
 * APP_URL: The public URL where the frontend app is served.
 * Used to construct shareable payment link URLs.
 */
export const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL ||
  Constants.expoConfig?.extra?.appUrl ||
  "https://app.bukkapay.com";

/**
 * Helper function to construct full API endpoints
 * Usage:
 *   fetch(apiUrl("/auth/login"), {...})
 */
export const apiUrl = (endpoint: string) => `${API_BASE}${endpoint}`;

/**
 * PAY_URL: the separate public app where anyone pays a link, claims money
 * or views a trade invoice (pay.bukkapay.com). Every link we share uses it.
 */
export const PAY_URL = process.env.EXPO_PUBLIC_PAY_URL || "https://pay.bukkapay.com";

/** Shareable payment link URL (the API returns the same in paymentUrl). */
export const payUrl = (linkId: string) => `${PAY_URL}/${linkId}`;
