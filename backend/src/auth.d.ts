import type { LoginInput, InsertUser } from "./shared/schema";
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function generateWalletId(): string;
export declare function signup(data: InsertUser): Promise<{
    id: string;
    name: string;
    walletId: string;
    email: string;
    username: string;
    phone: string | null;
    countryCode: string | null;
    password: string | null;
    avatar: string | null;
    biometricEnabled: boolean | null;
    verified: boolean | null;
    loyaltyPoints: number | null;
    createdAt: Date;
}>;
export declare function login(input: LoginInput): Promise<{
    id: string;
    name: string;
    walletId: string;
    email: string;
    username: string;
    phone: string | null;
    countryCode: string | null;
    password: string | null;
    avatar: string | null;
    biometricEnabled: boolean | null;
    verified: boolean | null;
    loyaltyPoints: number | null;
    createdAt: Date;
}>;
export declare function generateSessionToken(): string;
//# sourceMappingURL=auth.d.ts.map