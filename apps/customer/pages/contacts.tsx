import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { fetchContacts, createContact } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";

const COLORS = ["#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#3B82F6", "#EF4444"];

export default function Contacts() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");

  const { data: contacts, isLoading, refetch } = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => createContact(data),
    onSuccess: () => {
      toast({ title: "Contact added!" });
      refetch();
      setShowAddModal(false);
      setNewName("");
      setNewUsername("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newName || !newUsername) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    createMutation.mutate({ name: newName, username: newUsername, color });
  };

  const filteredContacts = (contacts || []).filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contacts</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={[styles.addButton, { borderColor: colors.border }]}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search contacts..."
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : filteredContacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{searchTerm ? "No contacts found" : "No contacts yet"}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Add your first contact to get started</Text>
        </View>
      ) : (
        filteredContacts.map((contact: any) => {
          const initials = contact.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
          return (
            <TouchableOpacity
              key={contact.id}
              onPress={() => router.push("/(tabs)/transfer" as any)}
              style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: contact.color || colors.primary }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.contactName, { color: colors.text }]}>{contact.name}</Text>
                  {contact.isFavorite && <Ionicons name="star" size={14} color="#F59E0B" />}
                </View>
                <Text style={[styles.contactUsername, { color: colors.textMuted }]}>@{contact.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })
      )}

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Contact</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Name *</Text>
            <TextInput
              placeholder="Contact name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
            />
            <Text style={[styles.inputLabel, { color: colors.text }]}>Username/Wallet ID *</Text>
            <TextInput
              placeholder="@username or wallet ID"
              placeholderTextColor={colors.textMuted}
              value={newUsername}
              onChangeText={setNewUsername}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
            />
            <TouchableOpacity
              onPress={handleCreate}
              disabled={createMutation.isPending}
              style={[styles.createButton, createMutation.isPending && { opacity: 0.6 }]}
            >
              <Text style={styles.createButtonText}>
                {createMutation.isPending ? "Adding..." : "Add Contact"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingBottom: 100, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  addButton: { padding: 8, borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8F9FA", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 16, color: "#1A1A2E" },
  emptyState: { paddingVertical: 48, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#1A1A2E", marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  contactCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, backgroundColor: "#F8F9FA", borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  contactName: { fontSize: 14, fontWeight: "600", color: "#1A1A2E" },
  contactUsername: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  inputLabel: { fontSize: 14, fontWeight: "500", color: "#1A1A2E", marginBottom: 8 },
  modalInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, fontSize: 15, color: "#1A1A2E", marginBottom: 12 },
  createButton: { backgroundColor: "#7C3AED", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  createButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
