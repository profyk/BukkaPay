import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { LoginInput, InsertUser } from "./shared/schema";

const BCRYPT_ROUNDS = 12;

// Hash a new password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Verify a password — handles both bcrypt (new) and legacy SHA-256 hashes.
// Returns { valid, needsRehash } so callers can upgrade legacy hashes on the fly.
export async function verifyPassword(
  password: string,
  hash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  // Bcrypt hashes always start with $2b$ or $2a$
  if (hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
    const valid = await bcrypt.compare(password, hash);
    return { valid, needsRehash: false };
  }

  // Legacy SHA-256 path — compare and flag for upgrade
  const sha256Hash = crypto.createHash("sha256").update(password).digest("hex");
  const valid = sha256Hash === hash;
  return { valid, needsRehash: valid }; // only rehash if the password is correct
}

export function generateWalletId(): string {
  return `BKP-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function signup(data: InsertUser) {
  const existingUser = await storage.getUserByEmail(data.email);
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const existingUsername = await storage.getUserByUsername(data.username);
  if (existingUsername) {
    throw new Error("Username already taken");
  }

  if (!data.password) {
    throw new Error("Password is required");
  }

  if (data.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const hashedPassword = await hashPassword(data.password);
  const walletId = generateWalletId();

  const user = await storage.createUser({
    ...data,
    password: hashedPassword,
    walletId,
  });

  return user;
}

export async function login(input: LoginInput) {
  const user = await storage.getUserByEmail(input.email);
  if (!user || !user.password) {
    throw new Error("Invalid email or password");
  }

  const { valid, needsRehash } = await verifyPassword(input.password, user.password);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  return { user, needsRehash };
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
