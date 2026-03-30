import { useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from "../lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  relatedId?: string;
  relatedType?: string;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Notifications() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const { data: notifications = [], isLoading, refetch, isRefetching } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<Notification[]>(["notifications"]);
      qc.setQueryData<Notification[]>(["notifications"], (old = []) => old.filter((n) => n.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      qc.setQueryData(["notifications"], []);
      toast({ title: "Cleared", description: "All notifications cleared" });
    },
  });

  const getIconName = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "success": return "checkmark-circle";
      case "warning": return "alert-circle";
      case "alert": return "alert-circle";
      default: return "information-circle";
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "success": return "#059669";
      case "warning": return "#D97706";
      case "alert": return "#DC2626";
      default: return "#2563EB";
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "success": return "rgba(16,185,129,0.08)";
      case "warning": return "rgba(245,158,11,0.08)";
      case "alert": return "rgba(239,68,68,0.08)";
      default: return "rgba(59,130,246,0.08)";
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case "success": return "rgba(16,185,129,0.25)";
      case "warning": return "rgba(245,158,11,0.25)";
      case "alert": return "rgba(239,68,68,0.25)";
      default: return "rgba(59,130,246,0.25)";
    }
  };

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, []);

  const handleMarkAsRead = useCallback((id: string, read: boolean) => {
    if (!read) markReadMutation.mutate(id);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        {notifications.length > 0 ? (
          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={() => markAllMutation.mutate()} style={styles.readAllBtn}>
                <Ionicons name="checkmark-done" size={14} color={colors.primary} />
                <Text style={[styles.readAllText, { color: colors.primary }]}>All read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => clearAllMutation.mutate()}>
              <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
            <Ionicons name="notifications-off" size={32} color="#6B7280" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Notifications</Text>
          <Text style={styles.emptySubtitle}>You're all caught up! Notifications will appear here as you use the app.</Text>
        </View>
      ) : (
        <>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Ionicons name="notifications" size={16} color="#2563EB" />
              <Text style={styles.unreadText}>
                {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
              </Text>
            </View>
          )}

          {notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              onPress={() => handleMarkAsRead(notification.id, notification.read)}
              style={[
                styles.notificationCard,
                {
                  backgroundColor: getBgColor(notification.type),
                  borderColor: notification.read ? getBorderColor(notification.type) : colors.primary,
                  borderWidth: notification.read ? 1 : 1.5,
                },
              ]}
            >
              <View style={styles.notificationRow}>
                <Ionicons name={getIconName(notification.type)} size={24} color={getIconColor(notification.type)} style={{ marginTop: 2 }} />
                <View style={styles.notificationContent}>
                  <View style={styles.notificationTitleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notificationTitle, { color: colors.text }]}>{notification.title}</Text>
                      <Text style={[styles.notificationMessage, { color: colors.text, opacity: 0.7 }]}>{notification.message}</Text>
                    </View>
                    {!notification.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={styles.notificationTime}>{timeAgo(notification.createdAt)}</Text>
                  <View style={styles.actionRow}>
                    {notification.relatedType === "transaction" && (
                      <TouchableOpacity
                        onPress={() => router.push("/(screens)/transaction-slip")}
                        style={styles.getSlipButton}
                      >
                        <Ionicons name="download" size={14} color="#FFFFFF" />
                        <Text style={styles.getSlipText}>Get Slip</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDelete(notification.id)} style={styles.deleteButton}>
                      <Ionicons name="trash" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 100, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  readAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  readAllText: { fontSize: 13, fontWeight: "600" },
  clearAllText: { fontSize: 14, fontWeight: "600" },
  loadingState: { paddingVertical: 80, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, opacity: 0.6 },
  unreadBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(59,130,246,0.1)", borderWidth: 1, borderColor: "rgba(59,130,246,0.3)", borderRadius: 12, padding: 12, marginBottom: 16 },
  unreadText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  notificationCard: { padding: 16, borderRadius: 16, marginBottom: 12 },
  notificationRow: { flexDirection: "row", gap: 12 },
  notificationContent: { flex: 1 },
  notificationTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  notificationTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  notificationMessage: { fontSize: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  notificationTime: { fontSize: 12, color: "#6B7280", marginTop: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  getSlipButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#2563EB" },
  getSlipText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
  deleteButton: { padding: 6, borderRadius: 8 },
  emptyState: { paddingVertical: 64, alignItems: "center" },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", paddingHorizontal: 24 },
});
