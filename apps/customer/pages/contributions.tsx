import { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, Modal, Platform, ActivityIndicator, Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { apiRequest, queryClient } from "../lib/queryClient";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../lib/ThemeContext";

// Local types (schema lives in backend — import types here)
interface ContributionGroup {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  targetAmount?: string | null;
  currentAmount: string;
  shareCode: string;
  status: string;
  createdAt: string;
}

// Must match the API's contribution categories.
const CATEGORIES = [
  { id: "community",  label: "Community",  icon: "people"     as const, color: "#7C3AED" },
  { id: "event",      label: "Family event", icon: "happy"    as const, color: "#D97706" },
  { id: "education",  label: "School",     icon: "school"     as const, color: "#2563EB" },
  { id: "medical",    label: "Medical",    icon: "medkit"     as const, color: "#EC4899" },
  { id: "emergency",  label: "Emergency",  icon: "alert-circle" as const, color: "#DC2626" },
  { id: "other",      label: "Other",      icon: "flag"       as const, color: "#475569" },
];

// ─── Create Group Modal ────────────────────────────────────────────────────────

function CreateGroupModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [targetAmount, setTargetAmount] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/contributions", data);
      return res.json();
    },
    onSuccess: (group: any) => {
      toast({ title: "Group created!", description: `Share code: ${group.shareCode}` });
      queryClient.invalidateQueries({ queryKey: ["/api/contributions"] });
      onClose();
      setTitle(""); setDescription(""); setCategory(""); setTargetAmount("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create group", variant: "destructive" });
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>New Contribution Group</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 16 }}>
          <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="e.g., Memorial Fund for John"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryOption,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  category === cat.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setCategory(cat.id)}
              >
                <Ionicons name={cat.icon} size={15} color={category === cat.id ? colors.primary : colors.textSecondary} />
                <Text style={[styles.categoryOptionText, { color: category === cat.id ? colors.primary : colors.textSecondary }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, height: 80, textAlignVertical: "top" }]}
            placeholder="What is this contribution for?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={[styles.label, { color: colors.text }]}>Target Amount (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            keyboardType="numeric"
            placeholder="No limit if left empty"
            placeholderTextColor={colors.textMuted}
            value={targetAmount}
            onChangeText={setTargetAmount}
          />

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: createMutation.isPending ? 0.6 : 1 }]}
            onPress={() => {
              if (!title || !category) {
                toast({ title: "Error", description: "Please fill in Title and Category", variant: "destructive" });
                return;
              }
              createMutation.mutate({ title, description: description || null, category, targetAmount: targetAmount || null });
            }}
            disabled={createMutation.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {createMutation.isPending ? "Creating..." : "Create Group"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({ group, visible, onClose }: { group: ContributionGroup; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://bukkapay.com/contribute/${group.shareCode}`;
  const shareText = `Help contribute to "${group.title}". Tap to join: ${shareUrl}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied!" });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.shareModalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Share "{group.title}"</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={{ padding: 24, gap: 12 }}>
            <View style={[styles.shareCodeBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.shareCodeText, { color: colors.text }]}>{group.shareCode}</Text>
            </View>

            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.border }]}
              onPress={copyLink}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={[styles.outlineButtonText, { color: colors.text }]}>
                {copied ? "Copied!" : "Copy Link"}
              </Text>
            </TouchableOpacity>

            <View style={styles.shareButtonRow}>
              <TouchableOpacity
                style={[styles.shareButton, { backgroundColor: "#16A34A" }]}
                onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`)}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.shareButtonText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shareButton, { backgroundColor: colors.textSecondary }]}
                onPress={() => Linking.openURL(`sms:?body=${encodeURIComponent(shareText)}`)}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.shareButtonText}>SMS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: ContributionGroup }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [shareVisible, setShareVisible] = useState(false);
  const catInfo = CATEGORIES.find((c) => c.id === group.category) || CATEGORIES[5];

  const currentAmount = parseFloat(group.currentAmount || "0");
  const targetAmount = group.targetAmount ? parseFloat(group.targetAmount) : null;
  const progress = targetAmount ? Math.min((currentAmount / targetAmount) * 100, 100) : 0;

  const fmt = (amount: number) => `R${amount.toFixed(2)}`;

  return (
    <>
      <TouchableOpacity
        style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => router.push(`/(screens)/contribution-detail?id=${group.id}` as any)}
        activeOpacity={0.8}
      >
        <View style={[styles.groupColorBar, { backgroundColor: catInfo.color }]} />
        <View style={styles.groupCardContent}>
          <View style={styles.groupCardRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.categorySmallBadge}>
                <Ionicons name={catInfo.icon} size={13} color={catInfo.color} />
                <Text style={[styles.categorySmallText, { color: colors.textSecondary }]}>{catInfo.label}</Text>
              </View>
              <Text style={[styles.groupTitle, { color: colors.text }]} numberOfLines={1}>{group.title}</Text>
              <Text style={[styles.groupAmount, { color: colors.primary }]}>{fmt(currentAmount)}</Text>

              {targetAmount && (
                <View style={{ marginTop: 8 }}>
                  <View style={[styles.progressBar, { backgroundColor: colors.surface }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    {Math.round(progress)}% of {fmt(targetAmount)} goal
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.shareSmallButton, { borderColor: colors.border }]}
              onPress={(e) => { e.stopPropagation?.(); setShareVisible(true); }}
            >
              <Ionicons name="share-social-outline" size={15} color={colors.primary} />
              <Text style={[styles.shareSmallText, { color: colors.primary }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      <ShareModal group={group} visible={shareVisible} onClose={() => setShareVisible(false)} />
    </>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function Contributions() {
  const router = useRouter();
  const { colors } = useTheme();
  const [createVisible, setCreateVisible] = useState(false);

  const { data: groups = [], isLoading } = useQuery<ContributionGroup[]>({
    queryKey: ["/api/contributions"],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contributions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Hero */}
        <View style={styles.heroSection}>
          <View style={[styles.heroCircle, { backgroundColor: "#059669" }]}>
            <Ionicons name="people" size={32} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Contribution Groups</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Create or join a group to collect money for funerals, church, fundraising and more.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => setCreateVisible(true)}
        >
          <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryButtonText}>Create Group</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 28 }]}>
          YOUR GROUPS ({groups.length})
        </Text>

        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : groups.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No groups yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Create one to start collecting</Text>
          </View>
        ) : (
          groups.map((g) => <GroupCard key={g.id} group={g} />)
        )}
      </ScrollView>

      <CreateGroupModal visible={createVisible} onClose={() => setCreateVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  contentContainer: { paddingHorizontal: 24, paddingBottom: 100 },
  heroSection: { alignItems: "center", paddingVertical: 24 },
  heroCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  heroSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  primaryButton: {
    borderRadius: 14,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginBottom: 12 },
  emptyState: {
    alignItems: "center",
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  emptySub: { fontSize: 13 },
  groupCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  groupColorBar: { height: 4 },
  groupCardContent: { padding: 16 },
  groupCardRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  categorySmallBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  categorySmallText: { fontSize: 12 },
  groupTitle: { fontSize: 15, fontWeight: "600" },
  groupAmount: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  progressBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressText: { fontSize: 12, marginTop: 4 },
  shareSmallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  shareSmallText: { fontSize: 12, fontWeight: "600" },
  // Modal styles
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryOptionText: { fontSize: 13, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  shareModalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  shareCodeBox: { padding: 14, borderRadius: 12, alignItems: "center" },
  shareCodeText: { fontFamily: "monospace", fontSize: 16, fontWeight: "700", letterSpacing: 2 },
  outlineButton: {
    flexDirection: "row",
    borderRadius: 12,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  outlineButtonText: { fontSize: 14, fontWeight: "600" },
  shareButtonRow: { flexDirection: "row", gap: 10 },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
