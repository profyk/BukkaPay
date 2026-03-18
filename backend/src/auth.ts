import crypto from "crypto";
import { storage } from "./storage";
import type { LoginInput, InsertUser } from "./shared/schema";

/**
 * Hash a password using SHA256
 */
export async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}

/**
 * Generate a unique wallet ID for users
 */
export function generateWalletId(): string {
  return `BKP-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

/**
 * Signup a regular user
 */
export async function signup(data: InsertUser) {
  const existingUser = await storage.getUserByEmail(data.email);
  if (existingUser) throw new Error("Email already registered");

  const existingUsername = await storage.getUserByUsername(data.username);
  if (existingUsername) throw new Error("Username already taken");

  if (!data.password) throw new Error("Password is required");

  const hashedPassword = await hashPassword(data.password);
  const walletId = generateWalletId();

  const user = await storage.createUser({
    ...data,
    password: hashedPassword,
    walletId,
  });

  return user;
}

/**
 * Login a regular user
 */
export async function login(input: LoginInput) {
  const user = await storage.getUserByEmail(input.email);
  if (!user || !user.password) throw new Error("Invalid email or password");

  const passwordValid = await verifyPassword(input.password, user.password);
  if (!passwordValid) throw new Error("Invalid email or password");

  return user;
}

/**
 * Login an admin
 */
export async function loginAdmin(input: LoginInput) {
  const admin = await storage.getAdminByEmail(input.email);
  if (!admin || !admin.password) throw new Error("Invalid admin email or password");

  const passwordValid = await verifyPassword(input.password, admin.password);
  if (!passwordValid) throw new Error("Invalid admin email or password");

  return admin;
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
