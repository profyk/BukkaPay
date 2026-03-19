import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isDemoMode, DEMO_USERS } from "@/lib/demo";

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
      if (isDemoMode()) return DEMO_USERS;
      const { data } = await api.get("/admin/users");
      return data as User[];
    },
  });
}

export function useUserActions() {
  const queryClient = useQueryClient();

  const mutateUser = (updater: (users: User[], id: string) => User[]) =>
    useMutation({
      mutationFn: async (_id: string) => {},
      onMutate: async (id: string) => {
        if (isDemoMode()) {
          await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
          const prev = queryClient.getQueryData<User[]>(USERS_QUERY_KEY);
          queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (old) =>
            updater(old ?? [], id)
          );
          return { prev };
        }
      },
      onError: (_err, _id, ctx: any) => {
        if (ctx?.prev) queryClient.setQueryData(USERS_QUERY_KEY, ctx.prev);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
    });

  const freezeUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.post(`/admin/freeze/${id}`);
    },
    onMutate: async (id: string) => {
      if (!isDemoMode()) return;
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const prev = queryClient.getQueryData<User[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (old) =>
        (old ?? []).map((u) => (u.id === id ? { ...u, status: "frozen" } : u))
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(USERS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const activateUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.post(`/admin/activate/${id}`);
    },
    onMutate: async (id: string) => {
      if (!isDemoMode()) return;
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const prev = queryClient.getQueryData<User[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (old) =>
        (old ?? []).map((u) => (u.id === id ? { ...u, status: "active" } : u))
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(USERS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.delete(`/admin/delete/${id}`);
    },
    onMutate: async (id: string) => {
      if (!isDemoMode()) return;
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const prev = queryClient.getQueryData<User[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (old) =>
        (old ?? []).map((u) => (u.id === id ? { ...u, status: "deleted" } : u))
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(USERS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });

  return { freezeUser, activateUser, deleteUser };
}
