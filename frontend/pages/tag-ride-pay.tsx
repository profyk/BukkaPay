import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { tagRideGetDriver, tagRidePay } from "../lib/api";
import { useCurrency } from "../lib/CurrencyContext";

const PRESET_FARES = [10, 15, 20, 25, 30, 50];

type Stage = "loading" | "select" | "confirm" | "processing" | "success" | "error";

export default function TagRidePay() {
  const router = useRouter();
  const { driverId } = useLocalSearchParams<{ driverId: string }>();
  const { currency } = useCurrency();

  const [stage, setStage] = useState<Stage>("loading");
  const [driver, setDriver] = useState<any>(null);
  const [selectedFare, setSelectedFare] = useState<number | null>(null);
  const [customFare, setCustomFare] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [reference, setReference] = useState("");
  const [newBalance, setNewBalance] = useState("");

  useEffect(() => {
    if (!driverId) {
      setErrorMsg("No driver ID found. Please scan the QR code again.");
      setStage("error");
      return;
    }
    loadDriver();
  }, [driverId]);

  const loadDriver = async () => {
    setStage("loading");
    try {
      const data = await tagRideGetDriver(driverId as string);
      setDriver(data);
      setStage("select");
    } catch (e: any) {
      setErrorMsg(e.message || "Could not load driver info");
      setStage("error");
    }
  };

  const effectiveFare = useCustom
    ? parseFloat(customFare) || 0
    : selectedFare ?? 0;

  const handleConfirm = () => {
    if (effectiveFare <= 0) {
      Alert.alert("Invalid Amount", "Please select or enter a fare amount");
      return;
    }
    setStage("confirm");
  };

  const handlePay = async () => {
    setStage("processing");
    try {
      const result = await tagRidePay(driverId as string, effectiveFare);
      setReference(result.reference || "");
      setNewBalance(result.passengerNewBalance || "");
      setStage("success");
    } catch (e: any) {
      setErrorMsg(e.message || "Payment failed");
      setStage("error");
    }
  };

  const LoadingView = () => (
    <View style={styles.centeredView}>
      <ActivityIndicator size="large" color="#7C3AED" />
      <Text style={styles.loadingText}>Loading driver info…</Text>
    </View>
  );

  const SelectView = () => (
    <View>
      <View style={styles.driverCard}>
        <View style={styles.driverAvatar}>
          <Ionicons name="person" size={28} color="#7C3AED" />
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{driver?.name || "Driver"}</Text>
          <View style={styles.driverMeta}>
            <Ionicons name="car-outline" size={13} color="#6B7280" />
            <Text style={styles.driverMetaText}>
              {driver?.vehicle_number} · {driver?.vehicle_type?.charAt(0).toUpperCase() + (driver?.vehicle_type?.slice(1) || "")}
            </Text>
          </View>
        </View>
        <View style={styles.verifiedBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#059669" />
          <Text style={styles.verifiedText}>Verified</Text>
        </View>
      </View>

      <Text style={styles.fareTitle}>Select Fare Amount</Text>
      <Text style={styles.fareSubtitle}>Choose a preset or enter a custom amount</Text>

      <View style={styles.fareGrid}>
        {PRESET_FARES.map((fare) => (
          <TouchableOpacity
            key={fare}
            style={[
              styles.fareChip,
              !useCustom && selectedFare === fare && styles.fareChipActive,
            ]}
            onPress={() => {
              setUseCustom(false);
              setSelectedFare(fare);
            }}
          >
            <Text
              style={[
                styles.fareChipText,
                !useCustom && selectedFare === fare && styles.fareChipTextActive,
              ]}
            >
              {currency.symbol}{fare}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.customToggle, useCustom && styles.customToggleActive]}
        onPress={() => { setUseCustom(true); setSelectedFare(null); }}
        activeOpacity={0.7}
      >
        <Ionicons name="pencil-outline" size={15} color={useCustom ? "#7C3AED" : "#6B7280"} />
        <Text style={[styles.customToggleText, useCustom && { color: "#7C3AED" }]}>
          Custom amount
        </Text>
      </TouchableOpacity>

      {useCustom && (
        <View style={styles.customInputWrap}>
          <View style={styles.customSymbol}>
            <Text style={styles.customSymbolText}>{currency.symbol}</Text>
          </View>
          <TextInput
            style={styles.customInput}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            value={customFare}
            onChangeText={setCustomFare}
            autoFocus
          />
        </View>
      )}

      {effectiveFare > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>You will pay</Text>
          <Text style={styles.totalAmount}>{currency.symbol}{effectiveFare.toFixed(2)}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.ctaBtn, effectiveFare <= 0 && styles.ctaBtnDisabled]}
        onPress={handleConfirm}
        disabled={effectiveFare <= 0}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaBtnText}>Continue to Pay</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  const ConfirmView = () => (
    <View>
      <View style={styles.confirmCard}>
        <View style={styles.confirmIconWrap}>
          <Ionicons name="cash-outline" size={36} color="#7C3AED" />
        </View>
        <Text style={styles.confirmTitle}>Confirm Payment</Text>
        <Text style={styles.confirmAmountLarge}>
          {currency.symbol}{effectiveFare.toFixed(2)}
        </Text>

        <View style={styles.confirmRows}>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmRowLabel}>Driver</Text>
            <Text style={styles.confirmRowValue}>{driver?.name}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmRowLabel}>Vehicle</Text>
            <Text style={styles.confirmRowValue}>{driver?.vehicle_number}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmRowLabel}>Amount</Text>
            <Text style={[styles.confirmRowValue, { color: "#7C3AED", fontWeight: "700" }]}>
              {currency.symbol}{effectiveFare.toFixed(2)}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmRowLabel}>From</Text>
            <Text style={styles.confirmRowValue}>BukkaPay Wallet</Text>
          </View>
        </View>

        <Text style={styles.confirmNote}>
          Funds will be transferred instantly from your wallet to the driver.
        </Text>
      </View>

      <TouchableOpacity style={styles.ctaBtn} onPress={handlePay} activeOpacity={0.85}>
        <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
        <Text style={styles.ctaBtnText}>Pay {currency.symbol}{effectiveFare.toFixed(2)}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => setStage("select")}>
        <Text style={styles.cancelBtnText}>Back</Text>
      </TouchableOpacity>
    </View>
  );

  const ProcessingView = () => (
    <View style={styles.centeredView}>
      <View style={styles.processingIcon}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
      <Text style={styles.processingTitle}>Processing Payment…</Text>
      <Text style={styles.processingSubtitle}>Please wait, do not close this screen</Text>
    </View>
  );

  const SuccessView = () => (
    <View style={styles.centeredView}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark" size={48} color="#FFFFFF" />
      </View>
      <Text style={styles.successTitle}>Payment Successful!</Text>
      <Text style={styles.successAmount}>{currency.symbol}{effectiveFare.toFixed(2)}</Text>
      <Text style={styles.successSubtitle}>paid to {driver?.name}</Text>

      {newBalance !== "" && (
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>New wallet balance</Text>
          <Text style={styles.balanceValue}>{currency.symbol}{parseFloat(newBalance).toFixed(2)}</Text>
        </View>
      )}

      {reference !== "" && (
        <Text style={styles.refText}>Ref: {reference}</Text>
      )}

      <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace("/(screens)/tag-ride" as any)}>
        <Text style={styles.ctaBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const ErrorView = () => (
    <View style={styles.centeredView}>
      <View style={styles.errorIcon}>
        <Ionicons name="close" size={40} color="#FFFFFF" />
      </View>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMsg}>{errorMsg}</Text>
      <TouchableOpacity style={styles.ctaBtn} onPress={() => router.back()}>
        <Text style={styles.ctaBtnText}>Go Back</Text>
      </TouchableOpacity>
      {stage === "error" && errorMsg.includes("driver") === false && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setStage("select")}>
          <Text style={styles.cancelBtnText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderContent = () => {
    switch (stage) {
      case "loading": return <LoadingView />;
      case "select": return <SelectView />;
      case "confirm": return <ConfirmView />;
      case "processing": return <ProcessingView />;
      case "success": return <SuccessView />;
      case "error": return <ErrorView />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (stage === "confirm" ? setStage("select") : router.back())}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="bus" size={16} color="#7C3AED" />
          </View>
          <Text style={styles.headerTitle}>Tag n Ride</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderContent()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: {
    width: 28, height: 28, borderRadius: 7, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  content: { padding: 20 },

  centeredView: { alignItems: "center", paddingVertical: 40 },
  loadingText: { fontSize: 15, color: "#6B7280", marginTop: 16 },

  driverCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB",
    borderRadius: 16, padding: 16, marginBottom: 28, gap: 12,
  },
  driverAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
  },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: "700", color: "#1A1A2E" },
  driverMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  driverMetaText: { fontSize: 12, color: "#6B7280" },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#D1FAE5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  verifiedText: { fontSize: 11, fontWeight: "600", color: "#059669" },

  fareTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A2E", marginBottom: 4 },
  fareSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 16 },
  fareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  fareChip: {
    width: "30%", paddingVertical: 14, borderRadius: 14, backgroundColor: "#F3F4F6",
    alignItems: "center", borderWidth: 2, borderColor: "transparent",
  },
  fareChipActive: { backgroundColor: "#EDE9FE", borderColor: "#7C3AED" },
  fareChipText: { fontSize: 16, fontWeight: "700", color: "#374151" },
  fareChipTextActive: { color: "#7C3AED" },

  customToggle: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: "#F9FAFB", marginBottom: 12, borderWidth: 1.5, borderColor: "#E5E7EB",
  },
  customToggleActive: { borderColor: "#7C3AED", backgroundColor: "#EDE9FE" },
  customToggleText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  customInputWrap: {
    flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: "#7C3AED",
    borderRadius: 14, overflow: "hidden", marginBottom: 16,
  },
  customSymbol: { paddingHorizontal: 14, paddingVertical: 14, backgroundColor: "#EDE9FE" },
  customSymbolText: { fontSize: 16, fontWeight: "700", color: "#7C3AED" },
  customInput: { flex: 1, paddingHorizontal: 14, fontSize: 20, fontWeight: "700", color: "#1A1A2E" },

  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#F3F4F6", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 20,
  },
  totalLabel: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  totalAmount: { fontSize: 22, fontWeight: "800", color: "#7C3AED" },

  ctaBtn: {
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 16,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    marginBottom: 12,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 14, color: "#7C3AED", fontWeight: "600" },

  confirmCard: {
    backgroundColor: "#F9FAFB", borderRadius: 20, padding: 24,
    alignItems: "center", marginBottom: 20,
  },
  confirmIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  confirmTitle: { fontSize: 20, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  confirmAmountLarge: { fontSize: 40, fontWeight: "800", color: "#7C3AED", marginBottom: 24 },
  confirmRows: { width: "100%", gap: 0 },
  confirmRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  confirmRowLabel: { fontSize: 14, color: "#6B7280" },
  confirmRowValue: { fontSize: 14, fontWeight: "600", color: "#1A1A2E" },
  confirmNote: { fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 16, lineHeight: 18 },

  processingIcon: { marginBottom: 20 },
  processingTitle: { fontSize: 20, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  processingSubtitle: { fontSize: 14, color: "#6B7280" },

  successIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: "#059669",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: "#1A1A2E", marginBottom: 4 },
  successAmount: { fontSize: 36, fontWeight: "800", color: "#7C3AED" },
  successSubtitle: { fontSize: 15, color: "#6B7280", marginBottom: 24 },
  balanceRow: {
    flexDirection: "row", justifyContent: "space-between", width: "100%",
    backgroundColor: "#F0FDF4", borderRadius: 12, padding: 14, marginBottom: 8,
  },
  balanceLabel: { fontSize: 13, color: "#059669" },
  balanceValue: { fontSize: 13, fontWeight: "700", color: "#059669" },
  refText: { fontSize: 12, color: "#9CA3AF", marginBottom: 24 },

  errorIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  errorTitle: { fontSize: 22, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  errorMsg: { fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 28, paddingHorizontal: 20 },
});
