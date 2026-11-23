import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useToast } from "../hooks/use-toast";
import { queryClient } from "../lib/queryClient";
import { createCard, getCardPricing } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";
import WalletCard from "./WalletCard";

const PREVIEW_NUMBER = "•••• •••• •••• ••••";

export default function AddCardDialog() {
  const [open, setOpen] = useState(false);
  const [cardName, setCardName] = useState("");
  const currency = "ZAR" as const;
  const [userName, setUserName] = useState("Card Holder");
  const [pricing, setPricing] = useState<{ issuanceFee: string; monthlyFee: string } | null>(null);
  const { toast } = useToast();
  const { colors } = useTheme();

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setUserName(user.name);
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    getCardPricing().then(setPricing).catch(() => setPricing(null));
  }, [open]);

  const createCardMutation = useMutation({
    mutationFn: createCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      toast({ title: "Card Created", description: `"${cardName.trim()}" wallet created. Its Visa card is on the way.` });
      handleClose();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create card. Try again." });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setCardName("");
  };

  const handleCreate = () => {
    if (!cardName.trim()) {
      toast({ title: "Name required", description: "Please give your card a name." });
      return;
    }
    createCardMutation.mutate({ title: cardName.trim(), currency });
  };

  return (
    <>
      <TouchableOpacity style={[styles.trigger, { borderColor: colors.border }]} onPress={() => setOpen(true)}>
        <Ionicons name="add" size={20} color={colors.textSecondary} />
        <Text style={[styles.triggerText, { color: colors.textSecondary }]}>Add another virtual card</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>New Virtual Card</Text>
              <TouchableOpacity onPress={handleClose} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Card Preview */}
            <View style={styles.previewWrap}>
              <WalletCard
                title={cardName.trim() || `${currency} wallet`}
                cardNumber={PREVIEW_NUMBER}
                holderName={userName}
                balance={0}
                currency={getCurrency(currency).symbol}
                showBalanceToggle={false}
              />
              <View style={[styles.stitchBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                <Text style={[styles.stitchBadgeText, { color: colors.primary }]}>Visa · online & tap to pay</Text>
              </View>
            </View>

            {/* Card Name Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Card Name</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.primary, backgroundColor: colors.inputBg, color: colors.text }]}
                value={cardName}
                onChangeText={setCardName}
                placeholder="e.g. Travel Fund, Shopping"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={32}
              />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Each wallet gets its own Visa virtual card once your ID is verified.</Text>
              {pricing && (Number(pricing.issuanceFee) > 0 || Number(pricing.monthlyFee) > 0) && (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {Number(pricing.issuanceFee) > 0 ? `${getCurrency(currency).symbol}${pricing.issuanceFee} issuance fee` : ""}
                  {Number(pricing.issuanceFee) > 0 && Number(pricing.monthlyFee) > 0 ? " · " : ""}
                  {Number(pricing.monthlyFee) > 0 ? `${getCurrency(currency).symbol}${pricing.monthlyFee}/month maintenance` : ""}
                  {" — charged to your default card"}
                </Text>
              )}
            </View>

            {/* Create Button */}
            <TouchableOpacity
              style={[styles.createBtn, (!cardName.trim() || createCardMutation.isPending) && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!cardName.trim() || createCardMutation.isPending}
            >
              {createCardMutation.isPending ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.createBtnText}>Issuing Card…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="card" size={18} color="#FFFFFF" />
                  <Text style={styles.createBtnText}>Issue Virtual Card</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  triggerText: {
    fontSize: 14,
    fontWeight: "500",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  previewWrap: {
    marginBottom: 20,
  },
  stitchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    alignSelf: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  stitchBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 20,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 15,
  },
  createBtnDisabled: {
    opacity: 0.45,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
