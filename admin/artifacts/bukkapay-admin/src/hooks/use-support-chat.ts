import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ConversationSummary {
  user: { id: string; name: string; username: string; email: string };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  message: string;
  isUserMessage: boolean;
  read: boolean;
  createdAt: string;
}

export function useConversations() {
  return useQuery({
    queryKey: ["support-chats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/support-chats", { params: { limit: 50 } });
      return data as { conversations: ConversationSummary[]; pagination: any };
    },
    refetchInterval: 15000,
  });
}

export function useConversation(userId: string | null) {
  return useQuery({
    queryKey: ["support-chats", userId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/support-chats/${userId}`);
      return data as ChatMessage[];
    },
    enabled: !!userId,
    refetchInterval: 6000,
  });
}

export function useSendReply(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const { data } = await api.post(`/admin/support-chats/${userId}`, { message });
      return data as ChatMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-chats", userId] });
      queryClient.invalidateQueries({ queryKey: ["support-chats"] });
    },
  });
}
