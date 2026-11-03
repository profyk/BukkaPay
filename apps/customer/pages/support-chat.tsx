import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

interface ChatMessage {
  id: string;
  message: string;
  isUserMessage: boolean;
  read: boolean;
  createdAt: string;
}

export default function SupportChat() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/support-chat"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/support-chat`, { headers: await getAuthHeader() });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 8000,
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`${API_BASE}/api/support-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support-chat"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    },
  });

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
    setInput("");
  };

  const waGreen = "#25D366";
  const bg = darkMode ? "#0B141A" : "#ECE5DD"; // WhatsApp-style chat background

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { backgroundColor: waGreen }]}>
        <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Ionicons name="headset" size={18} color={waGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>BukkaPay Support</Text>
          <Text style={styles.headerSub}>Usually replies within a few hours</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {isLoading && <ActivityIndicator color={waGreen} style={{ marginTop: 20 }} />}

        {!isLoading && messages.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={36} color={darkMode ? "#4B5563" : "#9CA3AF"} />
            <Text style={[styles.emptyText, { color: darkMode ? "#9CA3AF" : "#6B7280" }]}>
              Send a message and our support team will get back to you here.
            </Text>
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.messageRow, message.isUserMessage ? styles.messageRowUser : styles.messageRowSupport]}
          >
            <View style={[styles.messageBubble, message.isUserMessage ? styles.bubbleUser : styles.bubbleSupport]}>
              <Text style={[styles.messageText, message.isUserMessage ? styles.messageTextUser : styles.messageTextSupport]}>
                {message.message}
              </Text>
              <View style={styles.messageMetaRow}>
                <Text style={[styles.messageTime, message.isUserMessage ? styles.messageTimeUser : styles.messageTimeSupport]}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {message.isUserMessage && (
                  <Ionicons
                    name="checkmark-done"
                    size={14}
                    color={message.read ? "#53BDEB" : "rgba(255,255,255,0.6)"}
                    style={{ marginLeft: 4 }}
                  />
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputContainer, { backgroundColor: darkMode ? "#1F2C34" : "#F0F0F0" }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor={darkMode ? "#6B7280" : "#9CA3AF"}
          style={[styles.chatInput, { backgroundColor: darkMode ? "#2A3942" : "#FFFFFF", color: darkMode ? "#E9EDEF" : "#1A1A2E" }]}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: waGreen }]} disabled={sendMutation.isPending}>
          {sendMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  backButton: { padding: 4 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 1 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 16 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 32 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  messageRow: { marginBottom: 8, flexDirection: "row" },
  messageRowUser: { justifyContent: "flex-end" },
  messageRowSupport: { justifyContent: "flex-start" },
  messageBubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  bubbleUser: { backgroundColor: "#DCF8C6", borderTopRightRadius: 2 },
  bubbleSupport: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 2 },
  messageText: { fontSize: 14.5, lineHeight: 20, color: "#1A1A2E" },
  messageTextUser: { color: "#1A1A2E" },
  messageTextSupport: { color: "#1A1A2E" },
  messageMetaRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  messageTime: { fontSize: 10.5 },
  messageTimeUser: { color: "#667781" },
  messageTimeSupport: { color: "#667781" },
  inputContainer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chatInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
