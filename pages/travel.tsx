import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useToast } from "../hooks/use-toast";

const PRIMARY = "#7C3AED";
const SURFACE = "#F8F9FA";
const BORDER = "#E5E7EB";
const TEXT = "#1A1A2E";
const MUTED = "#6B7280";

const SA_BUS_CITIES = [
  "Johannesburg", "Cape Town", "Durban", "Pretoria",
  "Port Elizabeth", "East London", "Bloemfontein",
  "Nelspruit", "Polokwane", "Kimberley",
];

const SA_AIRPORTS = [
  { city: "Johannesburg", code: "JNB" },
  { city: "Cape Town", code: "CPT" },
  { city: "Durban", code: "DUR" },
  { city: "Port Elizabeth", code: "PLZ" },
  { city: "East London", code: "ELS" },
  { city: "George", code: "GRJ" },
  { city: "Bloemfontein", code: "BFN" },
];

type BusRoute = {
  id: string; operator: string; type: string; from: string; to: string;
  departure: string; arrival: string; duration: string; price: number;
  seats: number; rating: number; amenities: string[];
};

type FlightRoute = {
  id: string; airline: string; from: string; fromCode: string;
  to: string; toCode: string; departure: string; arrival: string;
  duration: string; price: number; stops: number; class: string; rating: number;
};

const BUS_ROUTES: BusRoute[] = [
  { id: "b1", operator: "Intercape", type: "Luxury Liner", from: "Johannesburg", to: "Cape Town", departure: "18:00", arrival: "10:00+1", duration: "16h", price: 450, seats: 14, rating: 4.7, amenities: ["WiFi", "AC", "Toilet", "USB"] },
  { id: "b2", operator: "Greyhound SA", type: "Premium", from: "Johannesburg", to: "Durban", departure: "20:30", arrival: "05:30+1", duration: "9h", price: 280, seats: 8, rating: 4.5, amenities: ["AC", "Recliner", "USB"] },
  { id: "b3", operator: "Translux", type: "Standard", from: "Johannesburg", to: "Cape Town", departure: "16:00", arrival: "08:30+1", duration: "16h 30m", price: 390, seats: 22, rating: 4.3, amenities: ["AC", "Toilet"] },
  { id: "b4", operator: "City to City", type: "Economy", from: "Johannesburg", to: "Durban", departure: "07:00", arrival: "15:30", duration: "8h 30m", price: 220, seats: 30, rating: 4.1, amenities: ["AC"] },
  { id: "b5", operator: "FlixBus SA", type: "Comfort", from: "Cape Town", to: "Port Elizabeth", departure: "08:00", arrival: "14:30", duration: "6h 30m", price: 310, seats: 18, rating: 4.6, amenities: ["WiFi", "AC", "USB"] },
  { id: "b6", operator: "Intercape", type: "Luxury Liner", from: "Pretoria", to: "Cape Town", departure: "17:00", arrival: "09:00+1", duration: "16h", price: 480, seats: 10, rating: 4.8, amenities: ["WiFi", "AC", "Toilet", "USB"] },
  { id: "b7", operator: "Greyhound SA", type: "Premium", from: "Durban", to: "Johannesburg", departure: "21:00", arrival: "06:00+1", duration: "9h", price: 290, seats: 5, rating: 4.5, amenities: ["AC", "Recliner", "USB"] },
  { id: "b8", operator: "Translux", type: "Standard", from: "Cape Town", to: "Johannesburg", departure: "17:30", arrival: "10:30+1", duration: "17h", price: 400, seats: 15, rating: 4.2, amenities: ["AC", "Toilet"] },
  { id: "b9", operator: "City to City", type: "Economy", from: "Johannesburg", to: "Bloemfontein", departure: "09:00", arrival: "13:00", duration: "4h", price: 180, seats: 25, rating: 4.0, amenities: ["AC"] },
  { id: "b10", operator: "Intercape", type: "Comfort", from: "Durban", to: "Port Elizabeth", departure: "06:00", arrival: "17:00", duration: "11h", price: 350, seats: 12, rating: 4.4, amenities: ["AC", "Toilet", "USB"] },
  { id: "b11", operator: "FlixBus SA", type: "Comfort", from: "Johannesburg", to: "Polokwane", departure: "10:00", arrival: "13:30", duration: "3h 30m", price: 160, seats: 20, rating: 4.3, amenities: ["WiFi", "AC", "USB"] },
  { id: "b12", operator: "Translux", type: "Standard", from: "Johannesburg", to: "East London", departure: "15:00", arrival: "06:00+1", duration: "15h", price: 420, seats: 18, rating: 4.2, amenities: ["AC", "Toilet"] },
  { id: "b13", operator: "Greyhound SA", type: "Premium", from: "Pretoria", to: "Durban", departure: "19:00", arrival: "04:00+1", duration: "9h", price: 300, seats: 9, rating: 4.6, amenities: ["AC", "Recliner", "USB"] },
  { id: "b14", operator: "City to City", type: "Economy", from: "Cape Town", to: "Bloemfontein", departure: "12:00", arrival: "22:00", duration: "10h", price: 260, seats: 28, rating: 4.0, amenities: ["AC"] },
];

const FLIGHTS: FlightRoute[] = [
  { id: "f1", airline: "FlySafair", from: "Johannesburg", fromCode: "JNB", to: "Cape Town", toCode: "CPT", departure: "07:30", arrival: "09:40", duration: "2h 10m", price: 1200, stops: 0, class: "Economy", rating: 4.7 },
  { id: "f2", airline: "Kulula.com", from: "Johannesburg", fromCode: "JNB", to: "Cape Town", toCode: "CPT", departure: "10:15", arrival: "12:25", duration: "2h 10m", price: 1050, stops: 0, class: "Economy", rating: 4.5 },
  { id: "f3", airline: "British Airways", from: "Johannesburg", fromCode: "JNB", to: "Durban", toCode: "DUR", departure: "08:00", arrival: "09:00", duration: "1h", price: 950, stops: 0, class: "Economy", rating: 4.6 },
  { id: "f4", airline: "FlySafair", from: "Johannesburg", fromCode: "JNB", to: "Durban", toCode: "DUR", departure: "11:30", arrival: "12:35", duration: "1h 05m", price: 890, stops: 0, class: "Economy", rating: 4.7 },
  { id: "f5", airline: "SAA", from: "Cape Town", fromCode: "CPT", to: "Johannesburg", toCode: "JNB", departure: "09:00", arrival: "11:10", duration: "2h 10m", price: 1350, stops: 0, class: "Economy", rating: 4.4 },
  { id: "f6", airline: "Kulula.com", from: "Cape Town", fromCode: "CPT", to: "Durban", toCode: "DUR", departure: "13:00", arrival: "15:20", duration: "2h 20m", price: 1100, stops: 0, class: "Economy", rating: 4.5 },
  { id: "f7", airline: "Cemair", from: "Durban", fromCode: "DUR", to: "Cape Town", toCode: "CPT", departure: "07:00", arrival: "09:20", duration: "2h 20m", price: 980, stops: 0, class: "Economy", rating: 4.3 },
  { id: "f8", airline: "FlySafair", from: "Johannesburg", fromCode: "JNB", to: "Port Elizabeth", toCode: "PLZ", departure: "06:45", arrival: "08:30", duration: "1h 45m", price: 870, stops: 0, class: "Economy", rating: 4.6 },
  { id: "f9", airline: "British Airways", from: "Cape Town", fromCode: "CPT", to: "Port Elizabeth", toCode: "PLZ", departure: "14:00", arrival: "15:30", duration: "1h 30m", price: 750, stops: 0, class: "Economy", rating: 4.5 },
  { id: "f10", airline: "SAA", from: "Johannesburg", fromCode: "JNB", to: "East London", toCode: "ELS", departure: "10:00", arrival: "11:30", duration: "1h 30m", price: 820, stops: 0, class: "Economy", rating: 4.4 },
  { id: "f11", airline: "Cemair", from: "Durban", fromCode: "DUR", to: "Johannesburg", toCode: "JNB", departure: "09:30", arrival: "10:35", duration: "1h 05m", price: 910, stops: 0, class: "Economy", rating: 4.3 },
  { id: "f12", airline: "FlySafair", from: "Cape Town", fromCode: "CPT", to: "Johannesburg", toCode: "JNB", departure: "15:00", arrival: "17:10", duration: "2h 10m", price: 1150, stops: 0, class: "Economy", rating: 4.7 },
  { id: "f13", airline: "Kulula.com", from: "Johannesburg", fromCode: "JNB", to: "George", toCode: "GRJ", departure: "08:30", arrival: "10:15", duration: "1h 45m", price: 980, stops: 0, class: "Economy", rating: 4.4 },
  { id: "f14", airline: "SAA", from: "Johannesburg", fromCode: "JNB", to: "Bloemfontein", toCode: "BFN", departure: "12:00", arrival: "13:00", duration: "1h", price: 720, stops: 0, class: "Economy", rating: 4.5 },
];

type TravelTab = "bus" | "flight";
type Stage = "search" | "results" | "checkout" | "pin" | "success";

interface PassengerInfo { name: string; idNumber: string; phone: string; }

export default function Travel() {
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TravelTab>("bus");
  const [stage, setStage] = useState<Stage>("search");

  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [passengerForms, setPassengerForms] = useState<PassengerInfo[]>([{ name: "", idNumber: "", phone: "" }]);

  const [pin, setPin] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingRef, setBookingRef] = useState("");

  const { data: cards = [] } = useQuery<any[]>({ queryKey: ["/api/wallet-cards"] });
  const walletBalance = cards.reduce((s: number, c: any) => s + parseFloat(c.balance || "0"), 0);
  const primaryCard = cards[0];

  const deductBalance = useMutation({
    mutationFn: async (amount: number) => {
      if (!primaryCard) throw new Error("No wallet card found. Please add a card first.");
      const newBal = (parseFloat(primaryCard.balance || "0") - amount).toFixed(2);
      return apiRequest("PATCH", `/api/wallet-cards/${primaryCard.id}`, { balance: newBal });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wallet-cards"] }),
  });

  const cityList = activeTab === "bus" ? SA_BUS_CITIES : SA_AIRPORTS.map(a => a.city);

  const filteredResults = activeTab === "bus"
    ? BUS_ROUTES.filter(r => (!fromCity || r.from === fromCity) && (!toCity || r.to === toCity))
    : FLIGHTS.filter(f => (!fromCity || f.from === fromCity) && (!toCity || f.to === toCity));

  const totalAmount = selectedItem ? selectedItem.price * passengerCount : 0;

  const swapCities = () => { const t = fromCity; setFromCity(toCity); setToCity(t); };

  const handleSearch = () => {
    if (!fromCity || !toCity) {
      toast({ title: "Select destinations", description: "Please choose both From and To", variant: "destructive" });
      return;
    }
    if (fromCity === toCity) {
      toast({ title: "Same city", description: "From and To cannot be the same", variant: "destructive" });
      return;
    }
    if (!travelDate.trim()) {
      toast({ title: "Select date", description: "Please enter your travel date", variant: "destructive" });
      return;
    }
    const results = activeTab === "bus"
      ? BUS_ROUTES.filter(r => r.from === fromCity && r.to === toCity)
      : FLIGHTS.filter(f => f.from === fromCity && f.to === toCity);
    if (results.length === 0) {
      toast({ title: "No results", description: `No ${activeTab === "bus" ? "buses" : "flights"} found for this route. Try swapping cities or a different route.`, variant: "destructive" });
      return;
    }
    setStage("results");
  };

  const handleBook = (item: any) => {
    setSelectedItem(item);
    setPassengerForms(Array.from({ length: passengerCount }, () => ({ name: "", idNumber: "", phone: "" })));
    setStage("checkout");
  };

  const updatePassenger = (i: number, field: keyof PassengerInfo, val: string) => {
    const updated = [...passengerForms];
    updated[i] = { ...updated[i], [field]: val };
    setPassengerForms(updated);
  };

  const handleProceedToPin = () => {
    for (let i = 0; i < passengerForms.length; i++) {
      if (!passengerForms[i].name.trim()) {
        toast({ title: "Missing info", description: `Enter name for Passenger ${i + 1}`, variant: "destructive" });
        return;
      }
      if (!passengerForms[i].phone.trim()) {
        toast({ title: "Missing info", description: `Enter phone for Passenger ${i + 1}`, variant: "destructive" });
        return;
      }
    }
    if (totalAmount > walletBalance) {
      toast({ title: "Insufficient balance", description: `You need R${totalAmount.toFixed(2)} but have R${walletBalance.toFixed(2)}`, variant: "destructive" });
      return;
    }
    setStage("pin");
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) setPin(p => p + digit);
  };

  const handleConfirmPayment = async () => {
    if (pin.length < 4) {
      toast({ title: "Enter PIN", description: "Please enter your 4-digit wallet PIN", variant: "destructive" });
      return;
    }
    const storedPin = (await AsyncStorage.getItem("wallet_pin")) || "1234";
    if (pin !== storedPin) {
      toast({ title: "Wrong PIN", description: "Incorrect PIN. Please try again.", variant: "destructive" });
      setPin("");
      return;
    }
    setIsProcessing(true);
    try {
      await deductBalance.mutateAsync(totalAmount);
      const ref = `BKP-${Date.now().toString(36).toUpperCase()}`;
      const operatorName = activeTab === "bus" ? selectedItem.operator : selectedItem.airline;
      try {
        await apiRequest("POST", "/api/transactions", {
          category: "travel",
          merchantName: operatorName,
          amount: totalAmount.toFixed(2),
          currency: "ZAR",
          status: "success",
          metadata: {
            ticketType: activeTab,
            bookingRef: ref,
            ticketStatus: "unused",
            operator: activeTab === "bus" ? selectedItem.operator : undefined,
            airline: activeTab === "flight" ? selectedItem.airline : undefined,
            from: selectedItem.from,
            to: selectedItem.to,
            fromCode: selectedItem.fromCode || undefined,
            toCode: selectedItem.toCode || undefined,
            departure: selectedItem.departure,
            arrival: selectedItem.arrival,
            duration: selectedItem.duration,
            seatClass: activeTab === "bus" ? selectedItem.type : selectedItem.class,
            travelDate,
            passengerCount,
            passengers: passengerForms,
            pricePerPerson: selectedItem.price,
            totalAmount,
          },
        });
      } catch (_) {}
      setBookingRef(ref);
      setStage("success");
    } catch (e: any) {
      toast({ title: "Payment failed", description: e.message || "Please try again", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setPin("");
    }
  };

  const handleNewSearch = () => {
    setStage("search");
    setSelectedItem(null);
    setPin("");
    setBookingRef("");
    setPassengerForms([{ name: "", idNumber: "", phone: "" }]);
  };

  if (stage === "success") {
    return (
      <View style={s.successBg}>
        <View style={s.successCard}>
          <View style={s.successCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </View>
          <Text style={s.successTitle}>Booking Confirmed!</Text>
          <Text style={s.successRef}>Ref: {bookingRef}</Text>

          <View style={s.successInfoBox}>
            <View style={s.successRow}>
              <Ionicons name={activeTab === "bus" ? "bus-outline" : "airplane-outline"} size={16} color={MUTED} />
              <Text style={s.successLabel}>{activeTab === "bus" ? selectedItem?.operator : selectedItem?.airline}</Text>
            </View>
            <View style={s.successRow}>
              <Ionicons name="location-outline" size={16} color={MUTED} />
              <Text style={s.successLabel}>
                {activeTab === "bus"
                  ? `${selectedItem?.from} → ${selectedItem?.to}`
                  : `${selectedItem?.fromCode} → ${selectedItem?.toCode}`}
              </Text>
            </View>
            <View style={s.successRow}>
              <Ionicons name="calendar-outline" size={16} color={MUTED} />
              <Text style={s.successLabel}>{travelDate}</Text>
            </View>
            <View style={s.successRow}>
              <Ionicons name="people-outline" size={16} color={MUTED} />
              <Text style={s.successLabel}>{passengerCount} passenger{passengerCount > 1 ? "s" : ""}</Text>
            </View>
            <View style={[s.successRow, { marginTop: 12, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12 }]}>
              <Text style={{ fontWeight: "700", color: TEXT, fontSize: 15 }}>Total Paid</Text>
              <Text style={{ fontWeight: "800", color: PRIMARY, fontSize: 18 }}>R{totalAmount.toFixed(2)}</Text>
            </View>
          </View>

          <Text style={s.successNote}>Your e-ticket details have been saved. Show this reference at boarding.</Text>

          <TouchableOpacity style={s.successBtn} onPress={handleNewSearch}>
            <Text style={s.successBtnText}>Book Another Trip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.successBtnOutline} onPress={() => router.push("/features-hub" as any)}>
            <Text style={s.successBtnOutlineText}>Back to Features</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (stage === "pin") {
    return (
      <View style={s.pinBg}>
        <View style={s.pinCard}>
          <TouchableOpacity style={s.pinBack} onPress={() => setStage("checkout")}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <View style={s.pinIconRow}>
            <View style={s.pinIconCircle}>
              <Ionicons name="lock-closed" size={28} color={PRIMARY} />
            </View>
          </View>
          <Text style={s.pinTitle}>Enter Wallet PIN</Text>
          <Text style={s.pinSub}>Confirm payment of <Text style={{ color: PRIMARY, fontWeight: "700" }}>R{totalAmount.toFixed(2)}</Text></Text>

          <View style={s.pinDots}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[s.pinDot, pin.length > i && s.pinDotFilled]} />
            ))}
          </View>

          <View style={s.pinGrid}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[s.pinKey, d === "" && { opacity: 0 }]}
                onPress={() => d === "⌫" ? setPin(p => p.slice(0, -1)) : d && handlePinInput(d)}
                disabled={d === ""}
              >
                <Text style={s.pinKeyText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[s.confirmBtn, (pin.length < 4 || isProcessing) && s.disabledBtn]}
            onPress={handleConfirmPayment}
            disabled={pin.length < 4 || isProcessing}
          >
            {isProcessing
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.confirmBtnText}>Confirm & Pay</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (stage === "checkout" && selectedItem) {
    const sufficient = walletBalance >= totalAmount;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={s.checkoutHeader}>
            <TouchableOpacity onPress={() => setStage("results")} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.checkoutHeaderTitle}>Checkout</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={s.checkoutBody}>
            <View style={s.tripSummaryCard}>
              <View style={s.tripSummaryTop}>
                <View style={[s.tripIcon, { backgroundColor: activeTab === "bus" ? "rgba(59,130,246,0.1)" : "rgba(139,92,246,0.1)" }]}>
                  <Ionicons name={activeTab === "bus" ? "bus" : "airplane"} size={22} color={activeTab === "bus" ? "#3B82F6" : PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tripOpName}>{activeTab === "bus" ? selectedItem.operator : selectedItem.airline}</Text>
                  <Text style={s.tripOpType}>{activeTab === "bus" ? selectedItem.type : selectedItem.class}</Text>
                </View>
                <View style={s.ratingPill}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={s.ratingPillText}>{selectedItem.rating}</Text>
                </View>
              </View>
              <View style={s.tripRouteRow}>
                <View style={{ alignItems: "center" }}>
                  <Text style={s.tripTime}>{selectedItem.departure}</Text>
                  <Text style={s.tripCity}>{activeTab === "bus" ? selectedItem.from : selectedItem.fromCode}</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    <Ionicons name={activeTab === "bus" ? "bus-outline" : "airplane-outline"} size={16} color={MUTED} style={{ marginHorizontal: 6 }} />
                    <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                  </View>
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{selectedItem.duration}</Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Text style={s.tripTime}>{selectedItem.arrival}</Text>
                  <Text style={s.tripCity}>{activeTab === "bus" ? selectedItem.to : selectedItem.toCode}</Text>
                </View>
              </View>
              <View style={[s.tripDateRow, { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, marginTop: 4 }]}>
                <View style={s.tripDateItem}>
                  <Ionicons name="calendar-outline" size={14} color={MUTED} />
                  <Text style={s.tripDateText}>{travelDate}</Text>
                </View>
                <View style={s.tripDateItem}>
                  <Ionicons name="people-outline" size={14} color={MUTED} />
                  <Text style={s.tripDateText}>{passengerCount} passenger{passengerCount > 1 ? "s" : ""}</Text>
                </View>
              </View>
            </View>

            <Text style={s.sectionHeading}>Passenger Details</Text>
            {passengerForms.map((pax, i) => (
              <View key={i} style={s.paxCard}>
                <Text style={s.paxTitle}>Passenger {i + 1}</Text>
                <Text style={s.fieldLabel}>Full Name *</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder="As on ID / Passport"
                  placeholderTextColor={MUTED}
                  value={pax.name}
                  onChangeText={v => updatePassenger(i, "name", v)}
                />
                <Text style={s.fieldLabel}>ID / Passport Number</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder="Optional"
                  placeholderTextColor={MUTED}
                  value={pax.idNumber}
                  onChangeText={v => updatePassenger(i, "idNumber", v)}
                />
                <Text style={s.fieldLabel}>Phone Number *</Text>
                <TextInput
                  style={s.fieldInput}
                  placeholder="+27 ..."
                  placeholderTextColor={MUTED}
                  keyboardType="phone-pad"
                  value={pax.phone}
                  onChangeText={v => updatePassenger(i, "phone", v)}
                />
              </View>
            ))}

            <View style={s.walletCard}>
              <View style={s.walletCardLeft}>
                <Ionicons name="wallet-outline" size={20} color={sufficient ? "#10B981" : "#EF4444"} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={s.walletLabel}>Wallet Balance</Text>
                  <Text style={[s.walletAmt, { color: sufficient ? "#10B981" : "#EF4444" }]}>
                    R{walletBalance.toFixed(2)}
                  </Text>
                </View>
              </View>
              <View style={[s.walletBadge, { backgroundColor: sufficient ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }]}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: sufficient ? "#10B981" : "#EF4444" }}>
                  {sufficient ? "Sufficient" : "Low Balance"}
                </Text>
              </View>
            </View>

            <View style={s.totalCard}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Price per person</Text>
                <Text style={s.totalValue}>R{selectedItem.price.toFixed(2)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Passengers</Text>
                <Text style={s.totalValue}>× {passengerCount}</Text>
              </View>
              <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12, marginTop: 8 }]}>
                <Text style={{ fontWeight: "700", fontSize: 16, color: TEXT }}>Total</Text>
                <Text style={{ fontWeight: "800", fontSize: 20, color: PRIMARY }}>R{totalAmount.toFixed(2)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[s.confirmBtn, !sufficient && s.disabledBtn]}
              onPress={handleProceedToPin}
              disabled={!sufficient}
            >
              <Ionicons name="lock-closed-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.confirmBtnText}>Pay with Wallet</Text>
            </TouchableOpacity>
            {!sufficient && (
              <Text style={s.insufficientNote}>Top up your wallet to continue</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (stage === "results") {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={s.resultsHeader}>
          <TouchableOpacity onPress={() => setStage("search")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.resultsHeaderTitle}>{fromCity} → {toCity}</Text>
            <Text style={s.resultsHeaderSub}>{travelDate} · {passengerCount} passenger{passengerCount > 1 ? "s" : ""}</Text>
          </View>
          <TouchableOpacity onPress={() => setStage("search")} style={s.editBtn}>
            <Ionicons name="options-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.tabBar}>
          {(["bus", "flight"] as TravelTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
              onPress={() => {
                setActiveTab(tab);
                setFromCity("");
                setToCity("");
                setStage("search");
              }}
            >
              <Ionicons
                name={tab === "bus" ? "bus-outline" : "airplane-outline"}
                size={16}
                color={activeTab === tab ? PRIMARY : MUTED}
              />
              <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>
                {tab === "bus" ? "Bus" : "Flights"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 40, gap: 12 }}>
          <Text style={s.resultsCount}>
            {filteredResults.length} {activeTab === "bus" ? "bus routes" : "flights"} found
          </Text>
          {filteredResults.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="search-outline" size={40} color={MUTED} />
              <Text style={s.emptyTitle}>No results found</Text>
              <Text style={s.emptySub}>Try a different route or travel date</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setStage("search")}>
                <Text style={s.emptyBtnText}>Edit Search</Text>
              </TouchableOpacity>
            </View>
          ) : activeTab === "bus" ? (
            (filteredResults as BusRoute[]).map(route => (
              <View key={route.id} style={s.resultCard}>
                <View style={s.rcTop}>
                  <View style={s.rcTopLeft}>
                    <View style={[s.rcIcon, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
                      <Ionicons name="bus" size={18} color="#3B82F6" />
                    </View>
                    <View>
                      <Text style={s.rcOperator}>{route.operator}</Text>
                      <Text style={s.rcType}>{route.type}</Text>
                    </View>
                  </View>
                  <View style={s.ratingPill}>
                    <Ionicons name="star" size={11} color="#F59E0B" />
                    <Text style={s.ratingPillText}>{route.rating}</Text>
                  </View>
                </View>
                <View style={s.rcRoute}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.rcTime}>{route.departure}</Text>
                    <Text style={s.rcCity}>{route.from}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                      <Ionicons name="bus-outline" size={14} color={MUTED} style={{ marginHorizontal: 4 }} />
                      <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    </View>
                    <Text style={s.rcDuration}>{route.duration}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.rcTime}>{route.arrival}</Text>
                    <Text style={s.rcCity}>{route.to}</Text>
                  </View>
                </View>
                <View style={s.rcAmenities}>
                  {route.amenities.map(a => (
                    <View key={a} style={s.amenityChip}>
                      <Text style={s.amenityText}>{a}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.rcBottom}>
                  <View>
                    <Text style={s.rcSeats}>{route.seats} seats left</Text>
                  </View>
                  <View style={s.rcPriceRow}>
                    <View>
                      <Text style={s.rcPrice}>R{route.price}</Text>
                      <Text style={s.rcPriceSub}>per person</Text>
                    </View>
                    <TouchableOpacity style={s.bookBtn} onPress={() => handleBook(route)}>
                      <Text style={s.bookBtnText}>Book Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          ) : (
            (filteredResults as FlightRoute[]).map(flight => (
              <View key={flight.id} style={s.resultCard}>
                <View style={s.rcTop}>
                  <View style={s.rcTopLeft}>
                    <View style={[s.rcIcon, { backgroundColor: "rgba(139,92,246,0.1)" }]}>
                      <Ionicons name="airplane" size={18} color={PRIMARY} />
                    </View>
                    <View>
                      <Text style={s.rcOperator}>{flight.airline}</Text>
                      <Text style={s.rcType}>{flight.stops === 0 ? "Non-stop" : `${flight.stops} stop`} · {flight.class}</Text>
                    </View>
                  </View>
                  <View style={s.ratingPill}>
                    <Ionicons name="star" size={11} color="#F59E0B" />
                    <Text style={s.ratingPillText}>{flight.rating}</Text>
                  </View>
                </View>
                <View style={s.rcRoute}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.rcTime}>{flight.departure}</Text>
                    <Text style={[s.rcCity, { fontWeight: "700", color: TEXT }]}>{flight.fromCode}</Text>
                    <Text style={s.rcCity}>{flight.from}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                      <Ionicons name="airplane-outline" size={14} color={MUTED} style={{ marginHorizontal: 4 }} />
                      <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    </View>
                    <Text style={s.rcDuration}>{flight.duration}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={s.rcTime}>{flight.arrival}</Text>
                    <Text style={[s.rcCity, { fontWeight: "700", color: TEXT }]}>{flight.toCode}</Text>
                    <Text style={s.rcCity}>{flight.to}</Text>
                  </View>
                </View>
                <View style={s.rcBottom}>
                  <View>
                    <Text style={{ fontSize: 12, color: "#10B981", fontWeight: "500" }}>✓ Available</Text>
                  </View>
                  <View style={s.rcPriceRow}>
                    <View>
                      <Text style={s.rcPrice}>R{flight.price}</Text>
                      <Text style={s.rcPriceSub}>per person</Text>
                    </View>
                    <TouchableOpacity style={s.bookBtn} onPress={() => handleBook(flight)}>
                      <Text style={s.bookBtnText}>Book Flight</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={s.searchHeader}>
        <View style={s.searchHeaderTop}>
          <TouchableOpacity onPress={() => router.push("/features-hub" as any)} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.searchHeaderTitle}>Travel Booking</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={s.searchTabs}>
          {(["bus", "flight"] as TravelTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.searchTab, activeTab === tab && s.searchTabActive]}
              onPress={() => { setActiveTab(tab); setFromCity(""); setToCity(""); }}
            >
              <Ionicons name={tab === "bus" ? "bus-outline" : "airplane-outline"} size={18} color={activeTab === tab ? PRIMARY : "#fff"} />
              <Text style={[s.searchTabText, activeTab === tab && s.searchTabTextActive]}>
                {tab === "bus" ? "Bus" : "Flights"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={s.searchCard}>
          <Text style={s.searchCardTitle}>Where are you going?</Text>

          <View style={s.fromToRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.fromToLabel}>From</Text>
              <TouchableOpacity style={s.fromToBtn} onPress={() => setShowFromPicker(true)}>
                <Ionicons name="location-outline" size={16} color={fromCity ? PRIMARY : MUTED} />
                <Text style={[s.fromToBtnText, fromCity ? { color: TEXT } : { color: MUTED }]}>
                  {fromCity || "Select city"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.swapBtn} onPress={swapCities}>
              <Ionicons name="swap-horizontal" size={20} color={PRIMARY} />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={s.fromToLabel}>To</Text>
              <TouchableOpacity style={s.fromToBtn} onPress={() => setShowToPicker(true)}>
                <Ionicons name="location" size={16} color={toCity ? PRIMARY : MUTED} />
                <Text style={[s.fromToBtnText, toCity ? { color: TEXT } : { color: MUTED }]}>
                  {toCity || "Select city"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={s.fromToLabel}>Travel Date</Text>
          <TextInput
            style={s.dateInput}
            placeholder="e.g. 2025-08-15"
            placeholderTextColor={MUTED}
            value={travelDate}
            onChangeText={setTravelDate}
          />

          <Text style={s.fromToLabel}>Passengers</Text>
          <View style={s.passengerRow}>
            <TouchableOpacity
              style={s.countBtn}
              onPress={() => setPassengerCount(Math.max(1, passengerCount - 1))}
            >
              <Ionicons name="remove" size={20} color={PRIMARY} />
            </TouchableOpacity>
            <Text style={s.countText}>{passengerCount}</Text>
            <TouchableOpacity
              style={s.countBtn}
              onPress={() => setPassengerCount(Math.min(9, passengerCount + 1))}
            >
              <Ionicons name="add" size={20} color={PRIMARY} />
            </TouchableOpacity>
            <Text style={s.countLabel}>{passengerCount === 1 ? "Adult" : "Adults"}</Text>
          </View>

          <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
            <Ionicons name="search" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.searchBtnText}>Search {activeTab === "bus" ? "Buses" : "Flights"}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.popularBox}>
          <Text style={s.popularTitle}>Popular Routes</Text>
          {(activeTab === "bus"
            ? [["Johannesburg", "Cape Town"], ["Johannesburg", "Durban"], ["Pretoria", "Cape Town"], ["Cape Town", "Port Elizabeth"]]
            : [["Johannesburg", "Cape Town"], ["Johannesburg", "Durban"], ["Cape Town", "Port Elizabeth"], ["Durban", "Cape Town"]]
          ).map(([from, to], i) => (
            <TouchableOpacity
              key={i}
              style={s.popularRoute}
              onPress={() => { setFromCity(from); setToCity(to); }}
            >
              <View style={s.popularRouteLeft}>
                <Ionicons name={activeTab === "bus" ? "bus-outline" : "airplane-outline"} size={16} color={PRIMARY} />
                <Text style={s.popularRouteText}>{from} → {to}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showFromPicker} transparent animationType="slide">
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select From City</Text>
              <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                <Ionicons name="close" size={24} color={TEXT} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {cityList.map(city => (
                <TouchableOpacity
                  key={city}
                  style={[s.pickerItem, fromCity === city && s.pickerItemActive]}
                  onPress={() => { setFromCity(city); setShowFromPicker(false); }}
                >
                  <Ionicons name="location-outline" size={16} color={fromCity === city ? PRIMARY : MUTED} />
                  <Text style={[s.pickerItemText, fromCity === city && { color: PRIMARY, fontWeight: "600" }]}>{city}</Text>
                  {fromCity === city && <Ionicons name="checkmark" size={16} color={PRIMARY} style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showToPicker} transparent animationType="slide">
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select To City</Text>
              <TouchableOpacity onPress={() => setShowToPicker(false)}>
                <Ionicons name="close" size={24} color={TEXT} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {cityList.filter(c => c !== fromCity).map(city => (
                <TouchableOpacity
                  key={city}
                  style={[s.pickerItem, toCity === city && s.pickerItemActive]}
                  onPress={() => { setToCity(city); setShowToPicker(false); }}
                >
                  <Ionicons name="location-outline" size={16} color={toCity === city ? PRIMARY : MUTED} />
                  <Text style={[s.pickerItemText, toCity === city && { color: PRIMARY, fontWeight: "600" }]}>{city}</Text>
                  {toCity === city && <Ionicons name="checkmark" size={16} color={PRIMARY} style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  searchHeader: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  searchHeaderTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  searchHeaderTitle: { color: "#fff", fontWeight: "700", fontSize: 18 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  searchTabs: { flexDirection: "row", gap: 10 },
  searchTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)" },
  searchTabActive: { backgroundColor: "#fff" },
  searchTabText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  searchTabTextActive: { color: PRIMARY },

  searchCard: { backgroundColor: SURFACE, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: BORDER },
  searchCardTitle: { fontWeight: "700", fontSize: 17, color: TEXT, marginBottom: 16 },
  fromToRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 16 },
  fromToLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  fromToBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#fff" },
  fromToBtnText: { fontSize: 14, fontWeight: "500" },
  swapBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(124,58,237,0.1)", justifyContent: "center", alignItems: "center", marginBottom: 2 },
  dateInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, backgroundColor: "#fff", marginBottom: 16 },
  passengerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  countBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: PRIMARY, justifyContent: "center", alignItems: "center" },
  countText: { fontSize: 18, fontWeight: "700", color: TEXT, minWidth: 28, textAlign: "center" },
  countLabel: { fontSize: 14, color: MUTED },
  searchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14 },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  popularBox: { backgroundColor: SURFACE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  popularTitle: { fontWeight: "700", fontSize: 15, color: TEXT, marginBottom: 12 },
  popularRoute: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  popularRouteLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  popularRouteText: { fontSize: 14, color: TEXT, fontWeight: "500" },

  resultsHeader: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  resultsHeaderTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resultsHeaderSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: PRIMARY },
  tabBtnText: { fontSize: 14, fontWeight: "500", color: MUTED },
  tabBtnTextActive: { color: PRIMARY, fontWeight: "700" },
  resultsCount: { fontSize: 13, color: MUTED, marginBottom: 4 },

  resultCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  rcTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  rcTopLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rcIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  rcOperator: { fontWeight: "600", fontSize: 14, color: TEXT },
  rcType: { fontSize: 12, color: MUTED },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.08)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  ratingPillText: { fontSize: 12, fontWeight: "600", color: "#92400E" },
  rcRoute: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  rcTime: { fontWeight: "700", fontSize: 16, color: TEXT },
  rcCity: { fontSize: 11, color: MUTED, marginTop: 2 },
  rcDuration: { fontSize: 11, color: MUTED, marginTop: 4 },
  rcAmenities: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  amenityChip: { backgroundColor: "rgba(124,58,237,0.06)", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  amenityText: { fontSize: 11, color: PRIMARY, fontWeight: "500" },
  rcBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12 },
  rcSeats: { fontSize: 12, color: "#EF4444", fontWeight: "500" },
  rcPriceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rcPrice: { fontSize: 20, fontWeight: "800", color: PRIMARY },
  rcPriceSub: { fontSize: 11, color: MUTED },
  bookBtn: { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  bookBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: TEXT },
  emptySub: { fontSize: 14, color: MUTED },
  emptyBtn: { marginTop: 8, backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: "#fff", fontWeight: "600" },

  checkoutHeader: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  checkoutHeaderTitle: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 18 },
  checkoutBody: { padding: 20, gap: 16 },

  tripSummaryCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  tripSummaryTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  tripIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  tripOpName: { fontWeight: "700", fontSize: 15, color: TEXT },
  tripOpType: { fontSize: 12, color: MUTED },
  tripRouteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  tripTime: { fontWeight: "700", fontSize: 16, color: TEXT },
  tripCity: { fontSize: 11, color: MUTED, marginTop: 2 },
  tripDateRow: { flexDirection: "row", gap: 20 },
  tripDateItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  tripDateText: { fontSize: 12, color: MUTED },

  sectionHeading: { fontWeight: "700", fontSize: 15, color: TEXT },
  paxCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  paxTitle: { fontWeight: "700", fontSize: 14, color: PRIMARY, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6, marginTop: 10 },
  fieldInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: TEXT, backgroundColor: "#fff" },

  walletCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  walletCardLeft: { flexDirection: "row", alignItems: "center" },
  walletLabel: { fontSize: 12, color: MUTED, fontWeight: "500" },
  walletAmt: { fontSize: 20, fontWeight: "800" },
  walletBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },

  totalCard: { backgroundColor: SURFACE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  totalLabel: { fontSize: 14, color: MUTED },
  totalValue: { fontSize: 14, fontWeight: "600", color: TEXT },

  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabledBtn: { opacity: 0.5 },
  insufficientNote: { textAlign: "center", fontSize: 13, color: "#EF4444", marginTop: 6 },

  pinBg: { flex: 1, backgroundColor: "#F9FAFB", justifyContent: "center", alignItems: "center", padding: 20 },
  pinCard: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 380, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  pinBack: { marginBottom: 16 },
  pinIconRow: { alignItems: "center", marginBottom: 16 },
  pinIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(124,58,237,0.1)", justifyContent: "center", alignItems: "center" },
  pinTitle: { fontSize: 22, fontWeight: "800", color: TEXT, textAlign: "center", marginBottom: 6 },
  pinSub: { fontSize: 14, color: MUTED, textAlign: "center", marginBottom: 28 },
  pinDots: { flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 32 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: BORDER, backgroundColor: "#fff" },
  pinDotFilled: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pinGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 24 },
  pinKey: { width: 80, height: 60, borderRadius: 12, backgroundColor: SURFACE, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: BORDER },
  pinKeyText: { fontSize: 22, fontWeight: "700", color: TEXT },

  successBg: { flex: 1, backgroundColor: "#F9FAFB", justifyContent: "center", alignItems: "center", padding: 20 },
  successCard: { backgroundColor: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: "800", color: TEXT, marginBottom: 4 },
  successRef: { fontSize: 13, color: MUTED, marginBottom: 24, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  successInfoBox: { width: "100%", backgroundColor: SURFACE, borderRadius: 14, padding: 16, marginBottom: 20, gap: 10 },
  successRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  successLabel: { fontSize: 14, color: TEXT },
  successNote: { fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  successBtn: { width: "100%", backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  successBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  successBtnOutline: { width: "100%", borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  successBtnOutlineText: { color: PRIMARY, fontWeight: "700", fontSize: 16 },

  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", paddingBottom: 40 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  pickerTitle: { fontWeight: "700", fontSize: 17, color: TEXT },
  pickerItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  pickerItemActive: { backgroundColor: "rgba(124,58,237,0.05)" },
  pickerItemText: { fontSize: 15, color: TEXT },
});
