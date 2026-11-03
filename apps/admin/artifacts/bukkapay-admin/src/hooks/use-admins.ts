import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_admin";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export const ADMINS_KEY = ["admins"];

export function useAdmins() {
  return useQuery({
    queryKey: ADMINS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/admins");
      return data as AdminUser[];
    },
  });
}

export function useAdminActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ADMINS_KEY });

  const createAdmin = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; role: "admin" | "super_admin" }) => {
      const { data } = await api.post("/admin/admins", payload);
      return data as AdminUser;
    },
    onSuccess: invalidate,
  });

  const updateAdmin = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; email?: string; password?: string; role?: string; isActive?: boolean }) => {
      const { data } = await api.patch(`/admin/admins/${id}`, payload);
      return data as AdminUser;
    },
    onSuccess: invalidate,
  });

  const deleteAdmin = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/admins/${id}`);
    },
    onSuccess: invalidate,
  });

  return { createAdmin, updateAdmin, deleteAdmin };
}
