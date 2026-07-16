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
import { createCard } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { CURRENCIES, CurrencyCode, getCurrency } from "../lib/currency";
import PremiumCard from "./PremiumCard";

const PREVIEW_NUMBER = "5399 •••• •••• ••••";

export default function AddCardDialog() {
  const [open, setOpen] = useState(false);
  const [cardName, setCardName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("ZAR");
  const [userName, setUserName] = useState("Card Holder");
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setUserName(user.name);
    })();
  }, []);

  const createCardMutation = useMutation({
    mutationFn: createCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      toast({ title: "Card Created", description: `"${cardName.trim()}" virtual card is ready.` });
      handleClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create card. Try again." });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setCardName("");
    setCurrency("ZAR");
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
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Ionicons name="add" size={20} color="#6B7280" />
        <Text style={styles.triggerText}>Add New Card</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            {/* Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>New Virtual Card</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Card Preview */}
            <View style={styles.previewWrap}>
              <PremiumCard
                cardNumber={PREVIEW_NUMBER}
                holderName={userName}
                balance={0}
                currency={getCurrency(currency).symbol}
                color="blue"
                showBalanceToggle={false}
              />
              <View style={styles.stitchBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#7C3AED" />
                <Text style={styles.stitchBadgeText}>Issued by Stitch · Mastercard</Text>
              </View>
            </View>

            {/* Card Name Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Card Name</Text>
              <TextInput
                style={styles.input}
                value={cardName}
                onChangeText={setCardName}
                placeholder="e.g. Travel Fund, Shopping"
                placeholderTextColor="#9CA3AF"
                autoFocus
                maxLength={32}
              />
              <Text style={styles.hint}>A real Mastercard virtual card will be issued for your account.</Text>
            </View>

            {/* Currency Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Currency</Text>
              <View style={styles.currencyRow}>
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyOption, currency === c.code && styles.currencyOptionActive]}
                    onPress={() => setCurrency(c.code)}
                  >
                    <Text style={[styles.currencyOptionSymbol, currency === c.code && styles.currencyOptionTextActive]}>{c.symbol}</Text>
                    <Text style={[styles.currencyOptionCode, currency === c.code && styles.currencyOptionTextActive]}>{c.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>This wallet will hold and settle balances in {getCurrency(currency).name}.</Text>
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
    borderColor: "#E5E7EB",
  },
  triggerText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
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
    color: "#1A1A2E",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
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
    backgroundColor: "#F4F3FF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  stitchBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
  inputGroup: {
    marginBottom: 20,
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#7C3AED",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1A1A2E",
    backgroundColor: "#FAFAFE",
  },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  currencyRow: {
    flexDirection: "row",
    gap: 10,
  },
  currencyOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#FAFAFE",
  },
  currencyOptionActive: {
    borderColor: "#7C3AED",
    backgroundColor: "#F4F3FF",
  },
  currencyOptionSymbol: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A2E",
  },
  currencyOptionCode: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 2,
  },
  currencyOptionTextActive: {
    color: "#7C3AED",
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
