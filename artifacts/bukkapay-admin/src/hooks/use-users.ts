import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  status: "active" | "frozen" | "deleted" | string;
  role: string;
}

export const USERS_QUERY_KEY = ["users"];

export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/users");
      return data as User[];
    },
  });
}

export function useUserActions() {
  const queryClient = useQueryClient();

  const freezeUser = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/freeze/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const activateUser = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/activate/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/delete/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  return {
    freezeUser,
    activateUser,
    deleteUser,
  };
}
