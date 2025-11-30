import type { User } from "@shared/schema";

const AUTH_TOKEN = "bukkapay_token";
const CURRENT_USER = "bukkapay_user";

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN, token);
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN);
  localStorage.removeItem(CURRENT_USER);
}

export function setCurrentUser(user: User) {
  localStorage.setItem(CURRENT_USER, JSON.stringify(user));
}

export function getCurrentUser(): User | null {
  const user = localStorage.getItem(CURRENT_USER);
  return user ? JSON.parse(user) : null;
}

export async function signup(email: string, username: string, password: string, name: string, phone?: string, countryCode?: string) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password, name, phone, countryCode }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Signup failed");
  }
  
  const data = await res.json();
  setAuthToken(data.token);
  setCurrentUser(data.user);
  return data;
}

export async function login(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Login failed");
  }
  
  const data = await res.json();
  setAuthToken(data.token);
  setCurrentUser(data.user);
  return data;
}

export function logout() {
  clearAuthToken();
}
