import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isDemoMode, DEMO_USERS } from "@/lib/demo";

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  walletId: string;
  phone: string;
  status: "active" | "frozen" | "deleted" | string;
  role: string;
  verified: boolean;
  createdAt: string | null;
}

export interface UserDetail {
  user: any;
  cards: any[];
  recentTransactions: any[];
  recentPaymentLinks: any[];
  loyalty: any | null;
  totalBalance: string;
}

export const USERS_QUERY_KEY = ["users"];

export function useUsers(page = 1) {
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, page],
    queryFn: async () => {
      if (isDemoMode()) return { users: DEMO_USERS as User[], pagination: { page: 1, limit: 50, total: DEMO_USERS.length, pages: 1 } };
      const { data } = await api.get(`/admin/users?page=${page}&limit=50`);
      return data as { users: User[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}

export function useUserDetail(id: string | null) {
  return useQuery({
    queryKey: ["user-detail", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/users/${id}`);
      return data as UserDetail;
    },
    enabled: !!id && !isDemoMode(),
  });
}

export function useUserActions() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });

  const freezeUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.post(`/admin/freeze/${id}`);
    },
    onSuccess: invalidate,
  });

  const activateUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.post(`/admin/activate/${id}`);
    },
    onSuccess: invalidate,
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.delete(`/admin/delete/${id}`);
    },
    onSuccess: invalidate,
  });

  const verifyUser = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      if (isDemoMode()) return;
      await api.patch(`/admin/users/${id}/verify`, { verified });
    },
    onSuccess: invalidate,
  });

  const notifyUser = useMutation({
    mutationFn: async ({ id, type, title, message }: { id: string; type: string; title: string; message: string }) => {
      await api.post(`/admin/users/${id}/notify`, { type, title, message });
    },
  });

  return { freezeUser, activateUser, deleteUser, verifyUser, notifyUser };
}
