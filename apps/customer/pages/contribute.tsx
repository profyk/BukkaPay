import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Switch } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { apiRequest, queryClient } from "../lib/queryClient";
import { API_BASE } from "../lib/config";

// Shapes returned by GET /api/contributions/... (camelCase API contract).
type ContributionGroup = {
  id: string; creatorId: string; title: string; description: string | null; category: string;
  targetAmount: string | null; currentAmount: string; paidOutAmount?: string; currency: string;
  shareCode: string; isActive: boolean; endDate: string | null; createdAt: string; status: string;
};
type Contribution = {
  id: string; groupId: string; contributorId: string | null; contributorName: string; contributorPhone: string | null;
  amount: string; message: string | null; isAnonymous: boolean; status?: string; createdAt: string;
};
import PinPrompt from "../components/PinPrompt";
import { useTheme } from "../lib/ThemeContext";

const categories = [
  { id: "community", label: "Community", icon: "people" as const, color: "#7C3AED" },
  { id: "event", label: "Family event", icon: "happy" as const, color: "#D97706" },
  { id: "education", label: "School", icon: "school" as const, color: "#2563EB" },
  { id: "medical", label: "Medical", icon: "medkit" as const, color: "#EC4899" },
  { id: "emergency", label: "Emergency", icon: "alert-circle" as const, color: "#DC2626" },
  { id: "other", label: "Other", icon: "flag" as const, color: "#475569" },
];

export default function Contribute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const code = (params.code as string) || "";
  const { colors } = useTheme();

  const [contributorName, setContributorName] = useState("");
  const [contributorPhone, setContributorPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [contributed, setContributed] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ group: ContributionGroup; contributions: Contribution[] }>({
    queryKey: ["/api/contributions/code", code],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/contributions/code/${code}`);
      if (!res.ok) throw new Error("Group not found");
      return res.json();
    },
    enabled: !!code,
  });

  const groupId = data?.group?.id;

  const contributeMutation = useMutation({
    mutationFn: async (contributionData: any) => {
      if (!groupId) throw new Error("Group not found");
      const response = await apiRequest("POST", `/api/contributions/${groupId}/contribute`, contributionData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Thank you!", description: "Your contribution has been paid into the campaign." });
      setPinOpen(false);
      setContributed(true);
      queryClient.invalidateQueries({ queryKey: ["/api/contributions/code", code] });
    },
    onError: () => { /* surfaced inside the PIN prompt */ },
  });

  const handleContribute = () => {
    if (!contributorName && !isAnonymous) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    // Contributions are paid from your wallet and confirmed with your PIN.
    setPending({
      contributorName: isAnonymous ? "Anonymous" : contributorName,
      contributorPhone: contributorPhone || null,
      amount,
      message: message || null,
      isAnonymous,
    });
    setPinOpen(true);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={[styles.mutedText, { color: colors.textMuted }]}>Loading...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="people" size={48} color={colors.textMuted} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Group Not Found</Text>
        <Text style={[styles.mutedText, { color: colors.textMuted }]}>This contribution link may be invalid or expired.</Text>
        <TouchableOpacity style={[styles.primaryButton, { marginTop: 16 }]} onPress={() => router.push("/" as any)}>
          <Text style={styles.primaryButtonText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { group, contributions } = data;
  const categoryInfo = categories.find((c) => c.id === group.category) || categories[5];
  const progress = group.targetAmount
    ? (parseFloat(group.currentAmount) / parseFloat(group.targetAmount)) * 100
    : 0;

  if (contributed) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <View style={styles.thankYouCircle}>
          <Ionicons name="checkmark" size={40} color="#059669" />
        </View>
        <Text style={[styles.thankYouTitle, { color: colors.text }]}>Thank You!</Text>
        <Text style={[styles.mutedText, { color: colors.textMuted }]}>Your contribution to "{group.title}" has been received.</Text>
        <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={() => setContributed(false)}>
          <Text style={[styles.outlineButtonText, { color: colors.text }]}>Make Another Contribution</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      <View style={[styles.heroHeader, { backgroundColor: categoryInfo.color }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.heroBackButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.categoryBadge}>
          <Ionicons name={categoryInfo.icon} size={20} color="#FFFFFF" />
          <Text style={styles.categoryLabel}>{categoryInfo.label}</Text>
        </View>

        <Text style={styles.heroTitle}>{group.title}</Text>
        {group.description && <Text style={styles.heroDesc}>{group.description}</Text>}

        <Text style={styles.heroAmount}>${group.currentAmount}</Text>
        {group.targetAmount && (
          <>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: "#FFFFFF" }]} />
            </View>
            <Text style={styles.heroProgress}>
              {Math.round(progress)}% of ${group.targetAmount} goal
            </Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Make a Contribution</Text>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Amount ($) *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
            />
            <View style={styles.presetRow}>
              {[10, 25, 50, 100, 200].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetButton, { borderColor: colors.border }]}
                  onPress={() => setAmount(preset.toString())}
                >
                  <Text style={[styles.presetText, { color: colors.text }]}>${preset}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchRow}>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ false: "#E5E7EB", true: "#7C3AED" }}
              thumbColor="#FFFFFF"
            />
            <Text style={[styles.switchLabel, { color: colors.text }]}>Contribute anonymously</Text>
          </View>

          {!isAnonymous && (
            <>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Your Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textMuted}
                  value={contributorName}
                  onChangeText={setContributorName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Phone (optional)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                  placeholder="Your phone number"
                  placeholderTextColor={colors.textMuted}
                  value={contributorPhone}
                  onChangeText={setContributorPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Message (optional)</Text>
            <TextInput
              style={[styles.input, { height: 64, textAlignVertical: "top", borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              placeholder="Leave a message of support..."
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, contributeMutation.isPending && styles.disabledButton]}
            onPress={handleContribute}
            disabled={contributeMutation.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {contributeMutation.isPending ? "Processing..." : `Contribute ${data?.group.currency ?? ""} ${amount || "0"}`}
            </Text>
          </TouchableOpacity>
        </View>

        {contributions.length > 0 && (
          <View>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Recent Contributions ({contributions.length})</Text>
            {contributions.slice(0, 10).map((c) => (
              <View key={c.id} style={[styles.contributionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contributorName, { color: colors.text }]}>{c.isAnonymous ? "Anonymous" : c.contributorName}</Text>
                  {c.message && <Text style={[styles.contributionMessage, { color: colors.textMuted }]}>"{c.message}"</Text>}
                </View>
                <Text style={styles.contributionAmount}>${c.amount}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <PinPrompt visible={pinOpen} title="Confirm contribution" onCancel={() => setPinOpen(false)}
                 onSubmit={(pin) => contributeMutation.mutateAsync({ ...pending, pin })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentContainer: {
    paddingBottom: 96,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  mutedText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginTop: 16,
    marginBottom: 8,
  },
  thankYouCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16,185,129,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  thankYouTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  heroHeader: {
    padding: 24,
    paddingTop: 48,
  },
  heroBackButton: {
    padding: 8,
    borderRadius: 20,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  heroProgress: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 24,
  },
  card: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#1A1A2E",
    backgroundColor: "#FFFFFF",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  presetText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 14,
    color: "#1A1A2E",
  },
  primaryButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  outlineButton: {
    borderRadius: 12,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 24,
    paddingHorizontal: 24,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  disabledButton: {
    opacity: 0.5,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  contributionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 8,
  },
  contributorName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A2E",
  },
  contributionMessage: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 2,
  },
  contributionAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#7C3AED",
  },
});
