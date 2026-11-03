import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function useAuth() {
  const queryClient = useQueryClient();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem("bukkapay_token");
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginInput) => {
      const response = await api.post("/admin/auth/login", credentials);
      return response.data as { token: string };
    },
    onSuccess: (data) => {
      localStorage.setItem("bukkapay_token", data.token);
      setIsAuthenticated(true);
    },
  });

  const logout = () => {
    localStorage.removeItem("bukkapay_token");
    setIsAuthenticated(false);
    queryClient.clear();
    const base = import.meta.env.BASE_URL ?? "/";
    window.location.href = base.endsWith("/") ? `${base}login` : `${base}/login`;
  };

  return {
    isAuthenticated,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    logout,
  };
}
