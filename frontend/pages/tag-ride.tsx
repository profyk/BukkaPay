import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { tagRideGetMyDriver, tagRideRegisterDriver, tagRideGetRides } from "../lib/api";
import { useCurrency } from "../lib/CurrencyContext";

const VEHICLE_TYPES = ["taxi", "minibus", "bus", "car"];

export default function TagRide() {
  const router = useRouter();
  const { currency } = useCurrency();

  const [mode, setMode] = useState<"passenger" | "driver">("passenger");
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [rides, setRides] = useState<any[]>([]);
  const [todayTotal, setTodayTotal] = useState("0.00");
  const [ridesLoading, setRidesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("taxi");
  const [registerLoading, setRegisterLoading] = useState(false);

  const loadDriverProfile = async () => {
    setDriverLoading(true);
    try {
      const data = await tagRideGetMyDriver();
      setDriverProfile(data);
    } catch {
      setDriverProfile(null);
    } finally {
      setDriverLoading(false);
    }
  };

  const loadRides = async (currentMode: "passenger" | "driver") => {
    setRidesLoading(true);
    try {
      const data = await tagRideGetRides(currentMode);
      setRides(data.rides || []);
      if (currentMode === "driver") setTodayTotal(data.todayTotal || "0.00");
    } catch {
      setRides([]);
    } finally {
      setRidesLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "driver") loadDriverProfile();
    loadRides(mode);
  }, [mode]);

  const handleRegister = async () => {
    if (!vehicleNumber.trim()) {
      Alert.alert("Required", "Please enter your vehicle number");
      return;
    }
    setRegisterLoading(true);
    try {
      const data = await tagRideRegisterDriver(vehicleNumber.trim(), vehicleType);
      setDriverProfile(data);
      setRegistering(false);
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message || "Something went wrong");
    } finally {
      setRegisterLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (mode === "driver") await loadDriverProfile();
    await loadRides(mode);
    setRefreshing(false);
  };

  const qrValue = driverProfile ? `bukkapay://tagride/${driverProfile.id}` : "bukkapay://tagride/unknown";

  const fmtTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return "Today";
    const yd = new Date(today); yd.setDate(yd.getDate() - 1);
    if (dt.toDateString() === yd.toDateString()) return "Yesterday";
    return dt.toLocaleDateString();
  };

  const PassengerView = () => (
    <View>
      <TouchableOpacity
        style={styles.scanCta}
        onPress={() => router.push("/(tabs)/scan" as any)}
        activeOpacity={0.85}
      >
        <View style={styles.scanCtaIconWrap}>
          <Ionicons name="qr-code-outline" size={52} color="#FFFFFF" />
        </View>
        <Text style={styles.scanCtaTitle}>Scan Driver QR to Pay</Text>
        <Text style={styles.scanCtaSubtitle}>
          Ask your driver to show their BukkaPay QR code, then scan it to pay the fare instantly.
        </Text>
        <View style={styles.scanCtaBtn}>
          <Ionicons name="scan" size={18} color="#7C3AED" />
          <Text style={styles.scanCtaBtnText}>Open Scanner</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.howCard}>
        <Text style={styles.sectionTitle}>How it works</Text>
        {[
          { icon: "person-outline" as const, text: "Ask your driver to open Tag n Ride in Driver mode" },
          { icon: "scan-outline" as const, text: "Scan their QR code using the BukkaPay scanner" },
          { icon: "cash-outline" as const, text: "Select your fare amount and confirm payment" },
        ].map((item, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Ionicons name={item.icon} size={18} color="#7C3AED" style={{ marginHorizontal: 12 }} />
            <Text style={styles.stepText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Recent Rides</Text>
      {ridesLoading ? (
        <ActivityIndicator color="#7C3AED" style={{ marginTop: 24 }} />
      ) : rides.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="car-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No rides yet</Text>
          <Text style={styles.emptySubtitle}>Your paid rides will appear here</Text>
        </View>
      ) : (
        rides.map((ride, i) => (
          <View key={i} style={styles.rideCard}>
            <View style={[styles.rideIcon, { backgroundColor: "#EDE9FE" }]}>
              <Ionicons name="car" size={20} color="#7C3AED" />
            </View>
            <View style={styles.rideInfo}>
              <Text style={styles.rideName}>{ride.driver_name || "Driver"}</Text>
              <Text style={styles.rideMeta}>
                {ride.vehicle_number} · {fmtDate(ride.created_at)} {fmtTime(ride.created_at)}
              </Text>
            </View>
            <Text style={styles.rideAmountDebit}>
              -{currency.symbol}{parseFloat(ride.amount).toFixed(2)}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  const DriverRegisterView = () => (
    <View style={styles.registerCard}>
      <View style={styles.registerIconWrap}>
        <Ionicons name="car-outline" size={40} color="#7C3AED" />
      </View>
      <Text style={styles.registerTitle}>
        {driverProfile ? "Edit Vehicle Info" : "Register as a Driver"}
      </Text>
      <Text style={styles.registerSubtitle}>
        Set up your driver profile to generate your payment QR code
      </Text>

      <Text style={styles.inputLabel}>Vehicle / Route Number *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. CA 123-456"
        placeholderTextColor="#9CA3AF"
        value={vehicleNumber}
        onChangeText={setVehicleNumber}
        autoCapitalize="characters"
      />

      <Text style={styles.inputLabel}>Vehicle Type</Text>
      <View style={styles.chipRow}>
        {VEHICLE_TYPES.map((vt) => (
          <TouchableOpacity
            key={vt}
            style={[styles.chip, vehicleType === vt && styles.chipActive]}
            onPress={() => setVehicleType(vt)}
          >
            <Text style={[styles.chipText, vehicleType === vt && styles.chipTextActive]}>
              {vt.charAt(0).toUpperCase() + vt.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.registerBtn, registerLoading && { opacity: 0.7 }]}
        onPress={handleRegister}
        disabled={registerLoading}
      >
        {registerLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.registerBtnText}>
            {driverProfile ? "Update Info" : "Register as Driver"}
          </Text>
        )}
      </TouchableOpacity>

      {driverProfile && (
        <TouchableOpacity onPress={() => setRegistering(false)} style={{ marginTop: 12 }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const DriverView = () => {
    if (driverLoading) {
      return <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 60 }} />;
    }
    if (!driverProfile || registering) {
      return <DriverRegisterView />;
    }
    return (
      <View>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Today's Earnings</Text>
          <Text style={styles.earningsAmount}>{currency.symbol}{parseFloat(todayTotal).toFixed(2)}</Text>
          <View style={styles.earningsDivider} />
          <Text style={styles.earningsTotal}>
            All-time: {currency.symbol}{parseFloat(driverProfile.total_earnings || "0").toFixed(2)}
          </Text>
        </View>

        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>Your Payment QR Code</Text>
          <Text style={styles.qrSubtitle}>Show this to passengers — they scan to pay</Text>
          <View style={styles.qrWrap}>
            <QRCode value={qrValue} size={200} backgroundColor="#FFFFFF" color="#1A1A2E" />
          </View>
          <View style={styles.vehicleTag}>
            <Ionicons name="car" size={14} color="#7C3AED" />
            <Text style={styles.vehicleTagText}>
              {driverProfile.vehicle_number} · {driverProfile.vehicle_type.charAt(0).toUpperCase() + driverProfile.vehicle_type.slice(1)}
            </Text>
          </View>
          <View style={styles.waitingRow}>
            <View style={styles.waitingDot} />
            <Text style={styles.waitingText}>Accepting payments</Text>
          </View>
          <TouchableOpacity onPress={() => { setVehicleNumber(driverProfile.vehicle_number); setRegistering(true); }} style={styles.editBtn}>
            <Ionicons name="pencil-outline" size={14} color="#6B7280" />
            <Text style={styles.editBtnText}>Edit vehicle info</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent Fares</Text>
        {ridesLoading ? (
          <ActivityIndicator color="#7C3AED" style={{ marginTop: 16 }} />
        ) : rides.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cash-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No fares yet</Text>
            <Text style={styles.emptySubtitle}>Completed payments will appear here</Text>
          </View>
        ) : (
          rides.map((ride, i) => (
            <View key={i} style={styles.rideCard}>
              <View style={[styles.rideIcon, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="cash" size={20} color="#059669" />
              </View>
              <View style={styles.rideInfo}>
                <Text style={styles.rideName}>{ride.passenger_name || "Passenger"}</Text>
                <Text style={styles.rideMeta}>{fmtDate(ride.created_at)} · {fmtTime(ride.created_at)}</Text>
              </View>
              <Text style={styles.rideAmountCredit}>
                +{currency.symbol}{parseFloat(ride.amount).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="bus" size={18} color="#7C3AED" />
          </View>
          <Text style={styles.headerTitle}>Tag n Ride</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.toggleWrap}>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === "passenger" && styles.toggleBtnActive]}
            onPress={() => setMode("passenger")}
          >
            <Ionicons name="person" size={15} color={mode === "passenger" ? "#FFFFFF" : "#6B7280"} />
            <Text style={[styles.toggleBtnText, mode === "passenger" && styles.toggleBtnTextActive]}>Passenger</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === "driver" && styles.toggleBtnActive]}
            onPress={() => setMode("driver")}
          >
            <Ionicons name="car" size={15} color={mode === "driver" ? "#FFFFFF" : "#6B7280"} />
            <Text style={[styles.toggleBtnText, mode === "driver" && styles.toggleBtnTextActive]}>Driver</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={["#7C3AED"]} />
        }
      >
        {mode === "passenger" ? <PassengerView /> : <DriverView />}
        <View style={{ height: 48 }} />
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
    width: 32, height: 32, borderRadius: 8, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  toggleWrap: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: "#FFFFFF" },
  toggle: {
    flexDirection: "row", backgroundColor: "#F3F4F6",
    borderRadius: 12, padding: 4,
  },
  toggleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  toggleBtnActive: { backgroundColor: "#7C3AED" },
  toggleBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  toggleBtnTextActive: { color: "#FFFFFF" },
  content: { paddingHorizontal: 20, paddingTop: 16 },

  scanCta: {
    backgroundColor: "#7C3AED", borderRadius: 20, padding: 24,
    alignItems: "center", marginBottom: 20,
  },
  scanCtaIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  scanCtaTitle: { fontSize: 22, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 },
  scanCtaSubtitle: {
    fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center",
    lineHeight: 20, marginBottom: 20,
  },
  scanCtaBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFFFFF", paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12,
  },
  scanCtaBtnText: { fontSize: 15, fontWeight: "700", color: "#7C3AED" },

  howCard: {
    backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, marginBottom: 24,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A2E", marginBottom: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
  },
  stepNum: { fontSize: 12, fontWeight: "700", color: "#7C3AED" },
  stepText: { flex: 1, fontSize: 13, color: "#4B5563", lineHeight: 18 },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },

  rideCard: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  rideIcon: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center",
    justifyContent: "center", marginRight: 12,
  },
  rideInfo: { flex: 1 },
  rideName: { fontSize: 14, fontWeight: "600", color: "#1A1A2E" },
  rideMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  rideAmountDebit: { fontSize: 14, fontWeight: "700", color: "#EF4444" },
  rideAmountCredit: { fontSize: 14, fontWeight: "700", color: "#059669" },

  registerCard: {
    backgroundColor: "#F9FAFB", borderRadius: 20, padding: 24, alignItems: "center",
  },
  registerIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  registerTitle: { fontSize: 20, fontWeight: "700", color: "#1A1A2E", marginBottom: 8 },
  registerSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  inputLabel: { alignSelf: "flex-start", fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    width: "100%", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1A1A2E",
    backgroundColor: "#FFFFFF", marginBottom: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24, alignSelf: "flex-start" },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E5E7EB",
  },
  chipActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  chipTextActive: { color: "#FFFFFF" },
  registerBtn: {
    width: "100%", backgroundColor: "#7C3AED", borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  registerBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  cancelText: { color: "#7C3AED", fontSize: 14, fontWeight: "500", textAlign: "center" },

  earningsCard: {
    backgroundColor: "#7C3AED", borderRadius: 20, padding: 24,
    alignItems: "center", marginBottom: 16,
  },
  earningsLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  earningsAmount: { fontSize: 40, fontWeight: "800", color: "#FFFFFF" },
  earningsDivider: { width: 40, height: 1, backgroundColor: "rgba(255,255,255,0.3)", marginVertical: 12 },
  earningsTotal: { fontSize: 13, color: "rgba(255,255,255,0.7)" },

  qrCard: {
    backgroundColor: "#F9FAFB", borderRadius: 20, padding: 24,
    alignItems: "center", marginBottom: 20,
  },
  qrTitle: { fontSize: 17, fontWeight: "700", color: "#1A1A2E", marginBottom: 6 },
  qrSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 20, textAlign: "center" },
  qrWrap: {
    padding: 16, backgroundColor: "#FFFFFF", borderRadius: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    marginBottom: 16,
  },
  vehicleTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#EDE9FE", paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, marginBottom: 12,
  },
  vehicleTagText: { fontSize: 13, fontWeight: "600", color: "#7C3AED" },
  waitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  waitingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  waitingText: { fontSize: 13, color: "#10B981", fontWeight: "600" },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 4,
  },
  editBtnText: { fontSize: 13, color: "#6B7280" },
});
