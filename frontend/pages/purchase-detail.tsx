import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Share, Alert, Linking, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { useCurrency } from "../lib/CurrencyContext";
import { convertAmount } from "../lib/currency";
import { apiRequest, queryClient } from "../lib/queryClient";
import { cancelTravelBooking } from "../lib/api";
import { useToast } from "../hooks/use-toast";

const PRIMARY = "#7C3AED";
const SURFACE = "#F8F9FA";
const BORDER = "#E5E7EB";
const TEXT = "#1A1A2E";
const MUTED = "#6B7280";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  travel:       "airplane-outline",
  airtime:      "call-outline",
  electricity:  "flash-outline",
  ticket:       "ticket-outline",
  hotel:        "business-outline",
  rental:       "home-outline",
  marketplace:  "bag-outline",
  contribution: "heart-outline",
  transfer:     "swap-horizontal-outline",
};

const categoryColors: Record<string, string> = {
  travel:       PRIMARY,
  airtime:      "#3B82F6",
  electricity:  "#EAB308",
  ticket:       "#A855F7",
  hotel:        "#06B6D4",
  rental:       "#22C55E",
  marketplace:  "#F97316",
  contribution: "#EC4899",
  transfer:     "#6366F1",
};

const metadataLabels: Record<string, Record<string, string>> = {
  electricity: { meter_number: "Meter Number", token: "Token", units: "Units Purchased" },
  airtime: { phone_number: "Phone Number", network: "Network" },
  ticket: { qr_code: "QR Code", event_date: "Event Date", venue: "Venue" },
  hotel: { booking_id: "Booking ID", check_in: "Check-in Date", check_out: "Check-out Date" },
  rental: { property_id: "Property ID", period: "Rental Period", payment_state: "Payment State" },
};

function TravelTicket({ transaction, onToggleUsed, onCancel, cancelling }: {
  transaction: any; onToggleUsed: () => void; onCancel: () => void; cancelling: boolean;
}) {
  const { currency } = useCurrency();
  const meta = transaction.metadata || {};
  const isBus = meta.ticketType === "bus";
  const isUsed = meta.ticketStatus === "used";
  const isRefunded = transaction.status === "refunded";
  const isPast = meta.travelDate ? new Date(meta.travelDate) < new Date(new Date().toDateString()) : false;
  const canCancel = !isUsed && !isRefunded && !isPast;
  const passengers: any[] = meta.passengers || [];

  const operatorName = isBus ? (meta.operator || transaction.merchantName) : (meta.airline || transaction.merchantName);
  const fromLabel = isBus ? meta.from : (meta.fromCode || meta.from);
  const toLabel = isBus ? meta.to : (meta.toCode || meta.to);
  const fromFull = meta.from;
  const toFull = meta.to;

  const handleWhatsApp = async () => {
    const lines = [
      `🎫 *BukkaPay ${isBus ? "Bus" : "Flight"} Ticket*`,
      ``,
      `*Booking Ref:* ${meta.bookingRef || transaction.reference}`,
      `*${isBus ? "Operator" : "Airline"}:* ${operatorName}`,
      `*Route:* ${fromFull} → ${toFull}`,
      isBus ? `` : `*Airports:* ${meta.fromCode} → ${meta.toCode}`,
      `*Departure:* ${meta.departure}  |  *Arrival:* ${meta.arrival}`,
      `*Date:* ${meta.travelDate}`,
      `*Duration:* ${meta.duration}`,
      `*Class:* ${meta.seatClass}`,
      `*Passengers:* ${meta.passengerCount}`,
      ``,
      ...passengers.map((p: any, i: number) =>
        `Passenger ${i + 1}: ${p.name}${p.idNumber ? ` (ID: ${p.idNumber})` : ""}${p.phone ? ` | ${p.phone}` : ""}`
      ),
      ``,
      `*Total Paid:* R${Number(transaction.amount).toFixed(2)}`,
      ``,
      `_Booked via BukkaPay · app.bukkapay.com_`,
    ].filter(l => l !== null && l !== undefined).join("\n");

    const encoded = encodeURIComponent(lines);
    const url = `whatsapp://send?text=${encoded}`;
    const webUrl = `https://wa.me/?text=${encoded}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      try {
        await Share.share({ message: lines, title: "BukkaPay Ticket" });
      } catch {
        await Clipboard.setStringAsync(lines);
        Alert.alert("Copied", "Ticket details copied to clipboard");
      }
    }
  };

  const handleShare = async () => {
    const lines = [
      `BukkaPay ${isBus ? "Bus" : "Flight"} Ticket`,
      `Booking Ref: ${meta.bookingRef || transaction.reference}`,
      `${isBus ? "Operator" : "Airline"}: ${operatorName}`,
      `Route: ${fromFull} → ${toFull}`,
      `Departure: ${meta.departure} | Arrival: ${meta.arrival}`,
      `Date: ${meta.travelDate}`,
      `Passengers: ${meta.passengerCount}`,
      `Total: R${Number(transaction.amount).toFixed(2)}`,
    ].join("\n");
    try {
      await Share.share({ message: lines, title: "BukkaPay Ticket" });
    } catch {
      await Clipboard.setStringAsync(lines);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[t.heroBg, { backgroundColor: isRefunded ? "#9CA3AF" : isUsed ? "#6B7280" : PRIMARY }]}>
        <View style={t.heroTop}>
          <View style={t.heroIcon}>
            <Ionicons name={isBus ? "bus" : "airplane"} size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={t.heroOperator}>{operatorName}</Text>
            <Text style={t.heroClass}>{meta.seatClass}</Text>
          </View>
          <View style={[t.usedBadge, { backgroundColor: isUsed || isRefunded ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)" }]}>
            <Text style={t.usedBadgeText}>{isRefunded ? "CANCELLED" : isUsed ? "USED" : "UNUSED"}</Text>
          </View>
        </View>

        <View style={t.routeRow}>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={t.routeCode}>{fromLabel}</Text>
            <Text style={t.routeCity}>{isBus ? "" : fromFull}</Text>
          </View>
          <View style={{ alignItems: "center", flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
              <Ionicons name={isBus ? "bus-outline" : "airplane-outline"} size={16} color="rgba(255,255,255,0.8)" />
              <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
            </View>
            <Text style={t.durationText}>{meta.duration}</Text>
          </View>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={t.routeCode}>{toLabel}</Text>
            <Text style={t.routeCity}>{isBus ? "" : toFull}</Text>
          </View>
        </View>

        <View style={t.timesRow}>
          <View style={{ alignItems: "center" }}>
            <Text style={t.timeLabel}>Departure</Text>
            <Text style={t.timeVal}>{meta.departure}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={t.timeLabel}>Date</Text>
            <Text style={t.timeVal}>{meta.travelDate}</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={t.timeLabel}>Arrival</Text>
            <Text style={t.timeVal}>{meta.arrival}</Text>
          </View>
        </View>
      </View>

      <View style={t.tearLine}>
        <View style={t.tearCircleLeft} />
        <View style={{ flex: 1, borderTopWidth: 1.5, borderTopColor: BORDER, borderStyle: "dashed" }} />
        <View style={t.tearCircleRight} />
      </View>

      <View style={t.body}>
        <View style={t.refRow}>
          <View style={t.refBox}>
            <Text style={t.refLabel}>Booking Reference</Text>
            <Text style={t.refCode}>{meta.bookingRef || transaction.reference}</Text>
          </View>
          <View style={t.refRight}>
            <Text style={t.refLabel}>Passengers</Text>
            <Text style={t.refVal}>{meta.passengerCount || 1}</Text>
          </View>
        </View>

        <View style={t.infoGrid}>
          <View style={t.infoCell}>
            <Text style={t.infoLabel}>From</Text>
            <Text style={t.infoVal}>{fromFull}</Text>
          </View>
          <View style={t.infoCell}>
            <Text style={t.infoLabel}>To</Text>
            <Text style={t.infoVal}>{toFull}</Text>
          </View>
          <View style={t.infoCell}>
            <Text style={t.infoLabel}>Class / Type</Text>
            <Text style={t.infoVal}>{meta.seatClass}</Text>
          </View>
          <View style={t.infoCell}>
            <Text style={t.infoLabel}>Total Paid</Text>
            <Text style={[t.infoVal, { color: PRIMARY, fontWeight: "700" }]}>
              R{Number(transaction.amount).toFixed(2)}
            </Text>
          </View>
        </View>

        {passengers.length > 0 && (
          <View style={t.section}>
            <Text style={t.sectionTitle}>Passengers</Text>
            {passengers.map((p: any, i: number) => (
              <View key={i} style={t.passengerCard}>
                <View style={t.passengerNumber}>
                  <Text style={t.passengerNumberText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={t.passengerName}>{p.name}</Text>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 2, flexWrap: "wrap" }}>
                    {p.idNumber ? (
                      <Text style={t.passengerSub}>ID: {p.idNumber}</Text>
                    ) : null}
                    {p.phone ? (
                      <Text style={t.passengerSub}>{p.phone}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={t.section}>
          <Text style={t.sectionTitle}>Booking Details</Text>
          <View style={t.detailRow}>
            <Text style={t.detailLabel}>Booked on</Text>
            <Text style={t.detailVal}>{format(new Date(transaction.createdAt), "MMM d, yyyy 'at' h:mm a")}</Text>
          </View>
          <View style={t.detailRow}>
            <Text style={t.detailLabel}>Price per person</Text>
            <Text style={t.detailVal}>R{Number(meta.pricePerPerson || 0).toFixed(2)}</Text>
          </View>
          <View style={t.detailRow}>
            <Text style={t.detailLabel}>Currency</Text>
            <Text style={t.detailVal}>{transaction.currency || "ZAR"}</Text>
          </View>
          <View style={t.detailRow}>
            <Text style={t.detailLabel}>Status</Text>
            <View style={[t.statusPill, { backgroundColor: isRefunded ? "#F3F4F6" : isUsed ? "#F3F4F6" : "#EDE9FE" }]}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: isRefunded || isUsed ? MUTED : PRIMARY }}>
                {isRefunded ? "CANCELLED" : isUsed ? "USED" : "UNUSED"}
              </Text>
            </View>
          </View>
        </View>

        {!isRefunded && (
          <TouchableOpacity
            style={[t.toggleBtn, { backgroundColor: isUsed ? "#F3F4F6" : "#EDE9FE", borderColor: isUsed ? BORDER : PRIMARY }]}
            onPress={onToggleUsed}
          >
            <Ionicons
              name={isUsed ? "refresh-outline" : "checkmark-circle-outline"}
              size={20}
              color={isUsed ? MUTED : PRIMARY}
            />
            <Text style={[t.toggleBtnText, { color: isUsed ? MUTED : PRIMARY }]}>
              {isUsed ? "Mark as Unused" : "Mark as Used"}
            </Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={[t.toggleBtn, { backgroundColor: "#FEF2F2", borderColor: "#EF4444" }]}
            onPress={onCancel}
            disabled={cancelling}
          >
            {cancelling ? <ActivityIndicator color="#EF4444" /> : (
              <>
                <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                <Text style={[t.toggleBtnText, { color: "#EF4444" }]}>Cancel Ticket & Refund</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={t.actionRow}>
          <TouchableOpacity style={t.whatsappBtn} onPress={handleWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={t.whatsappBtnText}>Send via WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={t.shareBtn} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={20} color={PRIMARY} />
            <Text style={t.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

export default function PurchaseDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currency } = useCurrency();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: transaction, isLoading, error, refetch } = useQuery<any>({
    queryKey: [`/api/purchase-transactions/${id}`],
    enabled: !!id,
  });

  const toggleUsedMutation = useMutation({
    mutationFn: async () => {
      const meta = transaction?.metadata || {};
      const newStatus = meta.ticketStatus === "used" ? "unused" : "used";
      return apiRequest("PATCH", `/api/purchase-transactions/${id}`, {
        metadata: { ticketStatus: newStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-transactions/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-transactions"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => cancelTravelBooking(id as string),
    onSuccess: () => {
      toast({ title: "Ticket cancelled", description: "Your fare has been refunded to your wallet." });
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-transactions/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cards"] });
    },
    onError: (e: any) => {
      toast({ title: "Could not cancel ticket", description: e.message, variant: "destructive" });
    },
  });

  const handleCopyReference = async () => {
    if (transaction?.reference) {
      await Clipboard.setStringAsync(transaction.reference);
      setCopied(true);
      Alert.alert("Copied", "Reference copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (transaction) {
      const text = `BukkaPay Transaction\nMerchant: ${transaction.merchantName}\nAmount: ${currency.symbol}${convertAmount(Number(transaction.amount), currency.code).toFixed(2)}\nReference: ${transaction.reference}\nDate: ${format(new Date(transaction.createdAt), "MMM d, yyyy 'at' h:mm a")}`;
      try {
        await Share.share({ message: text, title: "BukkaPay Receipt" });
      } catch {
        await Clipboard.setStringAsync(text);
      }
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (error || !transaction) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push("/purchases-hub" as any)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
          <Text style={styles.mutedText}>Transaction not found</Text>
          <TouchableOpacity onPress={() => router.push("/purchases-hub" as any)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isTravel = transaction.category === "travel";
  const iconName = isTravel
    ? (transaction.metadata?.ticketType === "bus" ? "bus" : "airplane")
    : (categoryIcons[transaction.category] || "bag-outline");
  const color = categoryColors[transaction.category] || MUTED;
  const meta = (transaction.metadata as Record<string, unknown>) || {};
  const catLabels = metadataLabels[transaction.category] || {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/purchases-hub" as any)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isTravel ? "Your Ticket" : "Transaction Details"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isTravel ? (
        <TravelTicket
          transaction={transaction}
          onToggleUsed={() => toggleUsedMutation.mutate()}
          onCancel={() => cancelMutation.mutate()}
          cancelling={cancelMutation.isPending}
        />
      ) : (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={[styles.heroCard, { backgroundColor: color }]}>
            <View style={styles.heroRow}>
              <View style={styles.heroIconContainer}>
                <Ionicons name={iconName} size={28} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.heroCategory}>{transaction.category}</Text>
                <Text style={styles.heroMerchant}>{transaction.merchantName || transaction.title}</Text>
              </View>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroAmountContainer}>
              <Text style={styles.heroAmountLabel}>Amount</Text>
              <Text style={styles.heroAmount}>
                {currency.symbol}{convertAmount(Number(transaction.amount), currency.code).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Transaction Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.mutedText}>Reference</Text>
              <View style={styles.referenceRow}>
                <Text style={styles.monoText}>{transaction.reference}</Text>
                <TouchableOpacity onPress={handleCopyReference} style={styles.copyButton}>
                  <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={16} color={copied ? "#10B981" : MUTED} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.mutedText}>Date</Text>
              <Text style={styles.detailValue}>{format(new Date(transaction.createdAt), "MMM d, yyyy")}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.mutedText}>Time</Text>
              <Text style={styles.detailValue}>{format(new Date(transaction.createdAt), "h:mm a")}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.mutedText}>Category</Text>
              <Text style={[styles.detailValue, { textTransform: "capitalize" }]}>{transaction.category}</Text>
            </View>
          </View>

          {Object.keys(meta).length > 0 && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textTransform: "capitalize" }]}>{transaction.category} Details</Text>
              {Object.entries(meta).map(([key, value]) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.mutedText}>
                    {catLabels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                  <Text style={styles.monoText}>{String(value)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity onPress={handleShare} style={styles.primaryButton}>
              <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  loadingContainer: { flex: 1, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 48, paddingBottom: 16 },
  backButton: { padding: 8, borderRadius: 20 },
  headerTitle: { fontWeight: "700", fontSize: 18, color: TEXT },
  scrollContent: { flex: 1, paddingHorizontal: 24 },
  heroCard: { borderRadius: 16, padding: 24, marginBottom: 24 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 },
  heroIconContainer: { width: 56, height: 56, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  heroCategory: { color: "rgba(255,255,255,0.8)", fontSize: 14, textTransform: "capitalize" },
  heroMerchant: { color: "#FFFFFF", fontWeight: "700", fontSize: 20 },
  heroDivider: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", marginBottom: 16 },
  heroAmountContainer: { alignItems: "center" },
  heroAmountLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 4 },
  heroAmount: { color: "#FFFFFF", fontWeight: "700", fontSize: 32 },
  card: { backgroundColor: SURFACE, borderRadius: 12, padding: 20, marginBottom: 24 },
  cardTitle: { fontWeight: "600", fontSize: 16, color: TEXT, marginBottom: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  mutedText: { color: MUTED, fontSize: 14 },
  detailValue: { color: TEXT, fontSize: 14 },
  monoText: { fontFamily: "monospace", fontSize: 13, color: TEXT },
  referenceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  copyButton: { padding: 4 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  primaryButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, borderRadius: 12, backgroundColor: PRIMARY },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, gap: 16 },
});

const t = StyleSheet.create({
  heroBg: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  heroOperator: { color: "#fff", fontWeight: "700", fontSize: 18 },
  heroClass: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 },
  usedBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  usedBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },

  routeRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  routeCode: { color: "#fff", fontWeight: "800", fontSize: 22 },
  routeCity: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  durationText: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 },

  timesRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  timeLabel: { color: "rgba(255,255,255,0.65)", fontSize: 11, textAlign: "center", marginBottom: 4 },
  timeVal: { color: "#fff", fontWeight: "700", fontSize: 15, textAlign: "center" },

  tearLine: { flexDirection: "row", alignItems: "center", marginHorizontal: 0 },
  tearCircleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#F3F4F6", marginLeft: -10 },
  tearCircleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#F3F4F6", marginRight: -10 },

  body: { paddingHorizontal: 20, paddingTop: 20 },

  refRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  refBox: { flex: 2 },
  refRight: { flex: 1, alignItems: "flex-end" },
  refLabel: { fontSize: 11, color: MUTED, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  refCode: { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", fontSize: 15, fontWeight: "700", color: PRIMARY, letterSpacing: 1 },
  refVal: { fontSize: 22, fontWeight: "800", color: TEXT },

  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  infoCell: { flex: 1, minWidth: "44%", backgroundColor: SURFACE, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  infoLabel: { fontSize: 11, color: MUTED, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  infoVal: { fontSize: 14, fontWeight: "600", color: TEXT },

  section: { marginBottom: 20 },
  sectionTitle: { fontWeight: "700", fontSize: 15, color: TEXT, marginBottom: 12 },

  passengerCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  passengerNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: PRIMARY, justifyContent: "center", alignItems: "center" },
  passengerNumberText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  passengerName: { fontWeight: "600", fontSize: 15, color: TEXT },
  passengerSub: { fontSize: 12, color: MUTED },

  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  detailLabel: { fontSize: 13, color: MUTED },
  detailVal: { fontSize: 13, color: TEXT, fontWeight: "500" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },

  toggleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, marginBottom: 16, marginTop: 8 },
  toggleBtnText: { fontWeight: "700", fontSize: 15 },

  actionRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  whatsappBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#25D366", borderRadius: 14, paddingVertical: 15 },
  whatsappBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14, paddingVertical: 15 },
  shareBtnText: { color: PRIMARY, fontWeight: "700", fontSize: 15 },
});
