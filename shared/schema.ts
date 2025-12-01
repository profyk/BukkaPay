import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  phone: text("phone"),
  countryCode: text("country_code").default("+1"),
  password: text("password"),
  biometricEnabled: boolean("biometric_enabled").default(false),
  verified: boolean("verified").default(false),
  loyaltyPoints: integer("loyalty_points").default(0),
  referralCode: varchar("referral_code").unique(),
  referralEarnings: decimal("referral_earnings", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const walletCards = pgTable("wallet_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("$"),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  cardNumber: text("card_number").notNull(),
  frozen: boolean("frozen").default(false),
  spendingLimit: decimal("spending_limit", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardId: varchar("card_id").references(() => walletCards.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(),
  icon: text("icon").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  username: text("username").notNull(),
  color: text("color").notNull(),
  isFavorite: boolean("is_favorite").default(false),
});

export const paymentRequests = pgTable("payment_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pointsEarned: integer("points_earned").notNull(),
  pointsRedeemed: integer("points_redeemed").default(0),
  tier: text("tier").default("bronze"),
  totalPoints: integer("total_points").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const autoPays = pgTable("auto_pays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  billName: text("bill_name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  frequency: text("frequency").notNull(),
  nextPaymentDate: timestamp("next_payment_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: varchar("referee_id").references(() => users.id, { onDelete: "cascade" }),
  earnings: decimal("earnings", { precision: 10, scale: 2 }).default("0"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const beneficiaries = pgTable("beneficiaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  walletId: varchar("wallet_id").notNull(),
  isFavorite: boolean("is_favorite").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const challenges = pgTable("challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  target: decimal("target", { precision: 10, scale: 2 }),
  current: decimal("current", { precision: 10, scale: 2 }).default("0"),
  reward: integer("reward").default(0),
  completed: boolean("completed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badge: text("badge").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isUserMessage: boolean("is_user_message").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const billSplits = pgTable("bill_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  participants: jsonb("participants"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const securitySettings = pgTable("security_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardsFrozen: jsonb("cards_frozen"),
  whitelistedMerchants: jsonb("whitelisted_merchants"),
  fraudAlerts: boolean("fraud_alerts").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentId: varchar("parent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  childId: varchar("child_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").default("child"),
  monthlyAllowance: decimal("monthly_allowance", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const virtualCards = pgTable("virtual_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cardNumber: varchar("card_number").notNull().unique(),
  cvv: varchar("cvv").notNull(),
  expiryDate: varchar("expiry_date").notNull(),
  spendingLimit: decimal("spending_limit", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true }).extend({
  email: z.string().email("Invalid email"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  countryCode: z.string().optional(),
  walletId: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string(),
});

export const insertWalletCardSchema = createInsertSchema(walletCards).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true });
export const insertPaymentRequestSchema = createInsertSchema(paymentRequests).omit({ id: true, createdAt: true });
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export const insertAutoPaySchema = createInsertSchema(autoPays).omit({ id: true, createdAt: true });
export const insertBeneficiarySchema = createInsertSchema(beneficiaries).omit({ id: true, createdAt: true });
export const insertChallengeSchema = createInsertSchema(challenges).omit({ id: true, createdAt: true });
export const insertAchievementSchema = createInsertSchema(achievements).omit({ id: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertBillSplitSchema = createInsertSchema(billSplits).omit({ id: true, createdAt: true });
export const insertVirtualCardSchema = createInsertSchema(virtualCards).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type WalletCard = typeof walletCards.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type AutoPay = typeof autoPays.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Beneficiary = typeof beneficiaries.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type BillSplit = typeof billSplits.$inferSelect;
export type VirtualCard = typeof virtualCards.$inferSelect;
