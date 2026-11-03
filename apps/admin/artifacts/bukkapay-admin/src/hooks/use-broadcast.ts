import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useBroadcast() {
  return useMutation({
    mutationFn: async (payload: { type: string; title: string; message: string }) => {
      const { data } = await api.post("/admin/broadcast", payload);
      return data as { success: boolean; sent: number };
    },
  });
}
