/**
 * Tap to pay: put a BukkaPay Visa card into Apple Wallet / Google Wallet so
 * the phone pays at any contactless terminal, anywhere Visa is accepted.
 *
 * How it works end to end:
 *  1. The app asks the API to provision a token (PIN-confirmed):
 *     POST /api/issued-cards/{id}/wallet-tokens → encrypted pass data from
 *     the card issuer (Visa Token Service).
 *  2. A native module hands that data to Apple (PKAddPaymentPassViewController)
 *     or Google (TapAndPay pushTokenize). The phone stores the token in its
 *     secure element; the issuer confirms it and the token turns "active".
 *  3. At the till the customer just holds the phone to the terminal; the
 *     authorization reaches BukkaPay's card webhook and is approved against
 *     their wallet balance in real time.
 *
 * Step 2 needs the native module `BukkaPayWalletProvisioning`, which Apple and
 * Google only allow in a licensed card issuer's app (Apple's payment-pass
 * provisioning entitlement, Google's TapAndPay allow-list). Until it ships in
 * the store build, isSupported() is false and the app says so honestly —
 * it never creates a wallet token the phone can't finish.
 */
import { Linking, NativeModules, Platform } from "react-native";
import { addCardToWallet, type IssuedCard, type WalletToken } from "./api";

type ProvisionInput = {
  wallet: WalletToken["wallet"]; cardholderName: string; last4: string | null;
  activationData: string; encryptedPassData: string | null; ephemeralPublicKey: string | null;
};
type NativeProvisioning = {
  isAvailable(): Promise<boolean>;
  provision(input: ProvisionInput): Promise<{ status: "added" | "cancelled" }>;
};

const native: NativeProvisioning | undefined = (NativeModules as any).BukkaPayWalletProvisioning;

export const phoneWallet: WalletToken["wallet"] = Platform.OS === "ios" ? "apple_pay" : "google_pay";
export const WALLET_NAME: Record<WalletToken["wallet"], string> = {
  apple_pay: "Apple Wallet", google_pay: "Google Wallet", samsung_pay: "Samsung Wallet",
};

export type Support =
  | { ok: true }
  | { ok: false; reason: "web" | "not_in_this_build" | "device"; message: string };

export async function isSupported(): Promise<Support> {
  if (Platform.OS === "web") {
    return { ok: false, reason: "web", message: "Tap to pay works in the BukkaPay phone app. Open BukkaPay on your iPhone or Android phone to add this card to your wallet." };
  }
  if (!native) {
    return { ok: false, reason: "not_in_this_build", message: `Adding cards to ${WALLET_NAME[phoneWallet]} switches on in a BukkaPay app update as soon as card issuing launches. Your card already works online.` };
  }
  try {
    if (!(await native.isAvailable())) {
      return { ok: false, reason: "device", message: `This phone can't add cards to ${WALLET_NAME[phoneWallet]} (it needs NFC and a screen lock).` };
    }
  } catch {
    return { ok: false, reason: "device", message: "Tap to pay isn't available on this phone." };
  }
  return { ok: true };
}

/** PIN-confirmed provisioning: API token + native hand-off. */
export async function addToPhoneWallet(card: IssuedCard, pin: string): Promise<"added" | "cancelled"> {
  const support = await isSupported();
  if (!support.ok) throw new Error(support.message);
  const data = await addCardToWallet(card.id, pin, phoneWallet, Platform.OS === "ios" ? "iPhone" : "Android phone",
    { platform: Platform.OS, version: String(Platform.Version) });
  const res = await native!.provision({
    wallet: phoneWallet, cardholderName: card.cardholderName, last4: card.last4,
    activationData: data.activationData, encryptedPassData: data.encryptedPassData, ephemeralPublicKey: data.ephemeralPublicKey,
  });
  return res.status;
}

export function activeToken(card: IssuedCard) {
  return card.walletTokens.find((t) => t.wallet === phoneWallet && t.status === "active");
}
export function pendingToken(card: IssuedCard) {
  return card.walletTokens.find((t) => t.wallet === phoneWallet && t.status !== "active" && t.status !== "deleted");
}

/** Opens the phone wallet so the customer can pick the card before tapping. */
export async function openPhoneWallet() {
  const url = Platform.OS === "ios" ? "shoebox://" : "https://wallet.google.com/";
  try { await Linking.openURL(url); } catch { /* wallet app missing */ }
}

export const TAP_STEPS: Record<"ios" | "android", string[]> = {
  ios: ["Double-click the side button", "Look at your iPhone (Face ID) or rest your finger", "Hold the top of your iPhone near the card machine"],
  android: ["Unlock your phone", "Hold the back of your phone near the card machine", "Wait for the tick, then you're done"],
};
