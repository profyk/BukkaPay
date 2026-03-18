import { db } from "./db/index";
import {
  users, admins, walletCards, transactions, contacts, paymentRequests, loyaltyRewards, autoPays,
  beneficiaries, challenges, achievements, chatMessages, billSplits, virtualCards, securitySettings,
  familyMembers, stokvels, stokvelMembers, merchants, merchantTransactions, properties, propertyUnits,
  tenants, rentPayments, rentPaymentLinks, webauthnCredentials, giftCards, contributionGroups,
  contributions, purchaseTransactions
} from "./shared/schema";
import type {
  User, InsertUser, Admin, WalletCard, InsertWalletCard, Transaction, InsertTransaction,
  Contact, InsertContact, PaymentRequest, InsertPaymentRequest, LoyaltyReward, AutoPay,
  Beneficiary, Challenge, Achievement, ChatMessage, BillSplit, VirtualCard, Merchant, InsertMerchant,
  MerchantTransaction, InsertMerchantTransaction, Property, InsertProperty, PropertyUnit, InsertPropertyUnit,
  Tenant, InsertTenant, RentPayment, InsertRentPayment, RentPaymentLink, InsertRentPaymentLink,
  WebauthnCredential, InsertWebauthnCredential, GiftCard, InsertGiftCard,
  ContributionGroup, InsertContributionGroup, Contribution, InsertContribution,
  PurchaseTransaction, InsertPurchaseTransaction
} from "./shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByWalletId(walletId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(userId: string, data: { name?: string; phone?: string; avatar?: string }): Promise<User | undefined>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;

  // Admins
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  createAdmin(adminData: { email: string; username: string; password: string; role: string }): Promise<Admin>;

  // Wallets
  getWalletCards(userId: string): Promise<WalletCard[]>;
  getWalletCard(id: string, userId: string): Promise<WalletCard | undefined>;
  createWalletCard(card: InsertWalletCard): Promise<WalletCard>;
  updateWalletCardBalance(id: string, userId: string, balance: string): Promise<WalletCard | undefined>;

  // Transactions
  getTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // Contacts
  getContacts(userId: string): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;

  // Payment Requests
  createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest>;
  getPaymentRequest(id: string): Promise<PaymentRequest | undefined>;
  getPaymentRequestsByUser(userId: string): Promise<PaymentRequest[]>;
  updatePaymentRequestStatus(id: string, status: string): Promise<PaymentRequest | undefined>;

  // Loyalty
  getLoyaltyReward(userId: string): Promise<LoyaltyReward | undefined>;
  updateLoyaltyPoints(userId: string, points: number): Promise<void>;

  // AutoPays
  getAutoPays(userId: string): Promise<AutoPay[]>;
  createAutoPay(autoPay: any): Promise<AutoPay>;

  // Beneficiaries
  getBeneficiaries(userId: string): Promise<Beneficiary[]>;
  createBeneficiary(beneficiary: any): Promise<Beneficiary>;

  // Challenges & Achievements
  getChallenges(userId: string): Promise<Challenge[]>;
  createChallenge(challenge: any): Promise<Challenge>;
  getAchievements(userId: string): Promise<Achievement[]>;
  createAchievement(achievement: any): Promise<Achievement>;

  // Virtual Cards
  createVirtualCard(card: any): Promise<VirtualCard>;
  getVirtualCards(userId: string): Promise<VirtualCard[]>;

  // Merchants
  createMerchant(merchant: InsertMerchant & { qrCode: string; paymentLink: string; userId: string }): Promise<Merchant>;
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByQrCode(qrCode: string): Promise<Merchant | undefined>;
  getMerchantByPaymentLink(paymentLink: string): Promise<Merchant | undefined>;
  getMerchantsByUser(userId: string): Promise<Merchant[]>;
  updateMerchantBalance(id: string, balance: string): Promise<Merchant | undefined>;
  createMerchantTransaction(transaction: InsertMerchantTransaction): Promise<MerchantTransaction>;
  getMerchantTransactions(merchantId: string, limit?: number): Promise<MerchantTransaction[]>;

  // Properties & Rentals
  createProperty(property: InsertProperty): Promise<Property>;
  getProperty(id: string): Promise<Property | undefined>;
  getPropertiesByMerchant(merchantId: string): Promise<Property[]>;
  getPropertiesByLandlord(landlordId: string): Promise<Property[]>;
  updateProperty(id: string, data: Partial<InsertProperty>): Promise<Property | undefined>;
  createPropertyUnit(unit: InsertPropertyUnit): Promise<PropertyUnit>;
  getPropertyUnit(id: string): Promise<PropertyUnit | undefined>;
  getPropertyUnits(propertyId: string): Promise<PropertyUnit[]>;
  updatePropertyUnit(id: string, data: Partial<InsertPropertyUnit>): Promise<PropertyUnit | undefined>;
  createTenant(tenant: InsertTenant & { tenantId: string }): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantByTenantId(tenantId: string): Promise<Tenant | undefined>;
  getTenantsByProperty(propertyId: string): Promise<Tenant[]>;
  getTenantsByLandlord(landlordId: string): Promise<Tenant[]>;
  getTenantByUserId(userId: string): Promise<Tenant | undefined>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  createRentPayment(payment: InsertRentPayment): Promise<RentPayment>;
  getRentPayments(tenantId: string): Promise<RentPayment[]>;
  getRentPaymentsByProperty(propertyId: string): Promise<RentPayment[]>;
  getRentPaymentsByMerchant(merchantId: string): Promise<RentPayment[]>;
  getRentPaymentsForMonth(tenantId: string, rentMonth: string): Promise<RentPayment[]>;

  // Rent Payment Links
  createRentPaymentLink(link: InsertRentPaymentLink): Promise<RentPaymentLink>;
  getRentPaymentLinkByCode(linkCode: string): Promise<RentPaymentLink | undefined>;
  updateRentPaymentLink(id: string, data: Partial<InsertRentPaymentLink>): Promise<RentPaymentLink | undefined>;

  // Cards & WebAuthn
  getCardsByUserId(userId: string): Promise<WalletCard[]>;
  updateCardBalance(id: string, balance: string): Promise<WalletCard | undefined>;
  createWebauthnCredential(credential: InsertWebauthnCredential): Promise<WebauthnCredential>;
  getWebauthnCredentialsByUserId(userId: string): Promise<WebauthnCredential[]>;
  getWebauthnCredentialByCredentialId(credentialId: string): Promise<WebauthnCredential | undefined>;
  updateWebauthnCredentialCounter(id: string, counter: number): Promise<void>;
  deleteWebauthnCredential(id: string): Promise<void>;
  updateUserBiometricEnabled(userId: string, enabled: boolean): Promise<void>;

  // Gift Cards
  createGiftCard(giftCard: InsertGiftCard & { code: string }): Promise<GiftCard>;
  getGiftCard(id: string): Promise<GiftCard | undefined>;
  getGiftCardByCode(code: string): Promise<GiftCard | undefined>;
  getGiftCardsBySender(senderId: string): Promise<GiftCard[]>;
  getReceivedGiftCards(userId: string): Promise<GiftCard[]>;
  updateGiftCardStatus(id: string, status: string, redeemedBy?: string): Promise<GiftCard | undefined>;

  // Contributions & Bill Splits
  createContributionGroup(group: InsertContributionGroup & { shareCode: string }): Promise<ContributionGroup>;
  getContributionGroup(id: string): Promise<ContributionGroup | undefined>;
  getContributionGroupByShareCode(shareCode: string): Promise<ContributionGroup | undefined>;
  getContributionGroupsByCreator(creatorId: string): Promise<ContributionGroup[]>;
  updateContributionGroupAmount(id: string, amount: string): Promise<ContributionGroup | undefined>;
  createContribution(contribution: InsertContribution): Promise<Contribution>;
  getContributionsByGroup(groupId: string): Promise<Contribution[]>;
  createBillSplit(billSplit: { creatorId: string; title: string; totalAmount: string; participants: any[] }): Promise<BillSplit>;
  getBillSplit(id: string): Promise<BillSplit | undefined>;
  getBillSplitsByUser(userId: string): Promise<BillSplit[]>;
  updateBillSplitParticipants(id: string, participants: any[]): Promise<BillSplit | undefined>;
  updateBillSplitStatus(id: string, status: string): Promise<BillSplit | undefined>;

  // Purchase Transactions
  createPurchaseTransaction(transaction: InsertPurchaseTransaction & { reference: string }): Promise<PurchaseTransaction>;
  getPurchaseTransaction(id: string): Promise<PurchaseTransaction | undefined>;
  getPurchaseTransactionsByUser(userId: string, filters?: { category?: string; status?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<PurchaseTransaction[]>;
}

export class DatabaseStorage implements IStorage {
  // ---------------- Users ----------------
  async getUser(id: string) { const [u] = await db.select().from(users).where(eq(users.id, id)); return u; }
  async getUserByUsername(username: string) { const [u] = await db.select().from(users).where(eq(users.username, username)); return u; }
  async getUserByEmail(email: string) { const [u] = await db.select().from(users).where(eq(users.email, email)); return u; }
  async getUserByWalletId(walletId: string) { const [u] = await db.select().from(users).where(eq(users.walletId, walletId)); return u; }
  async createUser(insertUser: InsertUser & { walletId: string }) { const [u] = await db.insert(users).values(insertUser as any).returning(); return u; }
  async updateUserProfile(userId: string, data: { name?: string; phone?: string; avatar?: string }) { const [u] = await db.update(users).set(data).where(eq(users.id, userId)).returning(); return u; }
  async updateUserPassword(userId: string, hashedPassword: string) { await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId)); }

  // ---------------- Admins ----------------
  async getAdminByEmail(email: string) { const [a] = await db.select().from(admins).where(eq(admins.email, email)); return a; }
  async getAdminByUsername(username: string) { const [a] = await db.select().from(admins).where(eq(admins.username, username)); return a; }
  async createAdmin(adminData: { email: string; username: string; password: string; role: string }) { const [a] = await db.insert(admins).values(adminData as any).returning(); return a; }

  // ---------------- Wallets ----------------
  async getWalletCards(userId: string) { return await db.select().from(walletCards).where(eq(walletCards.userId, userId)); }
  async getWalletCard(id: string, userId: string) { const [c] = await db.select().from(walletCards).where(and(eq(walletCards.id, id), eq(walletCards.userId, userId))); return c; }
  async createWalletCard(card: InsertWalletCard) { const [c] = await db.insert(walletCards).values(card).returning(); return c; }
  async updateWalletCardBalance(id: string, userId: string, balance: string) { const [c] = await db.update(walletCards).set({ balance }).where(and(eq(walletCards.id, id), eq(walletCards.userId, userId))).returning(); return c; }

  // ---------------- Transactions ----------------
  async getTransactions(userId: string, limit?: number) { let q = db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt)); if (limit) q = q.limit(limit) as any; return await q; }
  async createTransaction(transaction: InsertTransaction) { const [t] = await db.insert(transactions).values(transaction).returning(); return t; }

  // ---------------- Contacts ----------------
  async getContacts(userId: string) { return await db.select().from(contacts).where(eq(contacts.userId, userId)); }
  async createContact(contact: InsertContact) { const [c] = await db.insert(contacts).values(contact).returning(); return c; }

  // ---------------- Payment Requests ----------------
  async createPaymentRequest(request: InsertPaymentRequest) { const [r] = await db.insert(paymentRequests).values(request).returning(); return r; }
  async getPaymentRequest(id: string) { const [r] = await db.select().from(paymentRequests).where(eq(paymentRequests.id, id)); return r; }
  async getPaymentRequestsByUser(userId: string) { return await db.select().from(paymentRequests).where(eq(paymentRequests.userId, userId)).orderBy(desc(paymentRequests.createdAt)); }
  async updatePaymentRequestStatus(id: string, status: string) { const [r] = await db.update(paymentRequests).set({ status }).where(eq(paymentRequests.id, id)).returning(); return r; }

  // ---------------- Loyalty ----------------
  async getLoyaltyReward(userId: string) { const [r] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.userId, userId)); return r; }
  async updateLoyaltyPoints(userId: string, points: number) {
    const existing = await this.getLoyaltyReward(userId);
    if (existing) await db.update(loyaltyRewards).set({ totalPoints: (existing.totalPoints ?? 0) + points }).where(eq(loyaltyRewards.userId, userId));
    else await db.insert(loyaltyRewards).values({ userId, pointsEarned: points, totalPoints: points, tier: "bronze" });
  }

  // ---------------- AutoPays ----------------
  async getAutoPays(userId: string) { return await db.select().from(autoPays).where(eq(autoPays.userId, userId)); }
  async createAutoPay(autoPay: any) { const [a] = await db.insert(autoPays).values(autoPay).returning(); return a; }

  // ---------------- Beneficiaries ----------------
  async getBeneficiaries(userId: string) { return await db.select().from(beneficiaries).where(eq(beneficiaries.userId, userId)); }
  async createBeneficiary(beneficiary: any) { const [b] = await db.insert(beneficiaries).values(beneficiary).returning(); return b; }

  // ---------------- Challenges ----------------
  async getChallenges(userId: string) { return await db.select().from(challenges).where(eq(challenges.userId, userId)); }
  async createChallenge(challenge: any) { const [c] = await db.insert(challenges).values(challenge).returning(); return c; }

  // ---------------- Achievements ----------------
  async getAchievements(userId: string) { return await db.select().from(achievements).where(eq(achievements.userId, userId)); }
  async createAchievement(achievement: any) { const [a] = await db.insert(achievements).values(achievement).returning(); return a; }

  // ---------------- Virtual Cards ----------------
  async createVirtualCard(card: any) { const [v] = await db.insert(virtualCards).values(card).returning(); return v; }
  async getVirtualCards(userId: string) { return await db.select().from(virtualCards).where(eq(virtualCards.userId, userId)); }

  // ---------------- Merchants ----------------
  async createMerchant(merchant: InsertMerchant & { qrCode: string; paymentLink: string; userId: string }) { const [m] = await db.insert(merchants).values(merchant as any).returning(); return m; }
  async getMerchant(id: string) { const [m] = await db.select().from(merchants).where(eq(merchants.id, id)); return m; }
  async getMerchantByQrCode(qrCode: string) { const [m] = await db.select().from(merchants).where(eq(merchants.qrCode, qrCode)); return m; }
  async getMerchantByPaymentLink(paymentLink: string) { const [m] = await db.select().from(merchants).where(eq(merchants.paymentLink, paymentLink)); return m; }
  async getMerchantsByUser(userId: string) { return await db.select().from(merchants).where(eq(merchants.userId, userId)).orderBy(desc(merchants.createdAt)); }
  async updateMerchantBalance(id: string, balance: string) { const [m] = await db.update(merchants).set({ walletBalance: balance }).where(eq(merchants.id, id)).returning(); return m; }
  async createMerchantTransaction(transaction: InsertMerchantTransaction) { const [t] = await db.insert(merchantTransactions).values(transaction).returning(); return t; }
  async getMerchantTransactions(merchantId: string, limit?: number) { let q = db.select().from(merchantTransactions).where(eq(merchantTransactions.merchantId, merchantId)).orderBy(desc(merchantTransactions.createdAt)); if(limit) q = q.limit(limit) as any; return await q; }

  // ---------------- Properties ----------------
  async createProperty(property: InsertProperty) { const [p] = await db.insert(properties).values(property).returning(); return p; }
  async getProperty(id: string) { const [p] = await db.select().from(properties).where(eq(properties.id, id)); return p; }
  async getPropertiesByMerchant(merchantId: string) { return await db.select().from(properties).where(eq(properties.merchantId, merchantId)).orderBy(desc(properties.createdAt)); }
  async getPropertiesByLandlord(landlordId: string) { return await db.select().from(properties).where(eq(properties.landlordId, landlordId)).orderBy(desc(properties.createdAt)); }
  async updateProperty(id: string, data: Partial<InsertProperty>) { const [p]
