import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "../hooks/use-toast";
import { searchDepartures, bookTravel, fetchCards } from "../lib/api";
import { AFRICA_COUNTRIES, INTERNATIONAL_COUNTRIES, Country } from "../lib/countries";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const ALL_COUNTRIES = [...AFRICA_COUNTRIES, ...INTERNATIONAL_COUNTRIES];

type Stage = "search" | "origin" | "destination" | "results" | "passengers" | "payment" | "confirm" | "success";
type Mode = "bus" | "flight";

interface Passenger { name: string; idNumber: string; phone: string }

function emptyPassenger(): Passenger {
  return { name: "", idNumber: "", phone: "" };
}

export default function Travel() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();

  const [stage, setStage] = useState<Stage>("search");
  const [mode, setMode] = useState<Mode>("bus");
  const [origin, setOrigin] = useState<Country | null>(null);
  const [destination, setDestination] = useState<Country | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selectedDeparture, setSelectedDeparture] = useState<any | null>(null);
  const [seatClass, setSeatClass] = useState<"economy" | "business">("economy");
  const [passengers, setPassengers] = useState<Passenger[]>([emptyPassenger()]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookedTransaction, setBookedTransaction] = useState<any | null>(null);

  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const matchingCards = (cards as any[]).filter(
    c => !selectedDeparture || c.currency === selectedDeparture.currency
  );

  useEffect(() => {
    if (matchingCards.length > 0 && !matchingCards.find(c => c.id === selectedCardId)) {
      setSelectedCardId(matchingCards[0].id);
    }
  }, [selectedDeparture, cards]);

  const unitPrice = selectedDeparture
    ? (seatClass === "business" && selectedDeparture.businessPrice ? parseFloat(selectedDeparture.businessPrice) : parseFloat(selectedDeparture.price))
    : 0;
  const total = unitPrice * passengers.length;
  const selectedCard = matchingCards.find(c => c.id === selectedCardId);

  const header = (title: string, onBack: () => void) => (
    <View style={[s.headerBanner, { backgroundColor: PRIMARY }]}>
      <TouchableOpacity onPress={onBack} style={s.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  const handleSearch = async () => {
    if (!origin || !destination) {
      toast({ title: "Choose an origin and destination", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const rows = await searchDepartures({
        mode, originCountryCode: origin.code, destinationCountryCode: destination.code,
      });
      setResults(rows);
      setStage("results");
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDeparture = (dep: any) => {
    setSelectedDeparture(dep);
    setSeatClass("economy");
    setPassengers([emptyPassenger()]);
    setStage("passengers");
  };

  const addPassenger = () => {
    if (passengers.length >= selectedDeparture.seatsAvailable) {
      toast({ title: `Only ${selectedDeparture.seatsAvailable} seat(s) left`, variant: "destructive" });
      return;
    }
    setPassengers(p => [...p, emptyPassenger()]);
  };

  const removePassenger = (i: number) => setPassengers(p => p.filter((_, idx) => idx !== i));

  const updatePassenger = (i: number, field: keyof Passenger, value: string) =>
    setPassengers(p => p.map((pax, idx) => idx === i ? { ...pax, [field]: value } : pax));

  const handlePassengersContinue = () => {
    if (passengers.some(p => !p.name.trim())) {
      toast({ title: "Enter a name for every passenger", variant: "destructive" });
      return;
    }
    setStage("payment");
  };

  const handleBook = async () => {
    if (!selectedCardId || !selectedDeparture) return;
    setBooking(true);
    try {
      const transaction = await bookTravel({
        departureId: selectedDeparture.departureId,
        fromCardId: selectedCardId,
        seatClass,
        passengers: passengers.map(p => ({
          name: p.name.trim(),
          idNumber: p.idNumber.trim() || undefined,
          phone: p.phone.trim() || undefined,
        })),
      });
      setBookedTransaction(transaction);
      setStage("success");
    } catch (e: any) {
      toast({ title: "Booking failed", description: e.message, variant: "destructive" });
    } finally {
      setBooking(false);
    }
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  if (stage === "search") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Travel Booking", () => router.back())}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View style={[s.modeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(["bus", "flight"] as Mode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.modeBtn, mode === m && { backgroundColor: PRIMARY }]}
                onPress={() => { setMode(m); setOrigin(null); setDestination(null); }}
              >
                <Ionicons name={m === "bus" ? "bus" : "airplane"} size={18} color={mode === m ? "#fff" : colors.textMuted} />
                <Text style={[s.modeBtnText, { color: mode === m ? "#fff" : colors.textSecondary }]}>
                  {m === "bus" ? "Bus" : "Flight"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View>
            <Text style={[s.sectionLabel, { color: colors.text }]}>From</Text>
            <TouchableOpacity
              style={[s.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setStage("origin")}
            >
              {origin ? (
                <><Text style={s.countryFlag}>{origin.flag}</Text><Text style={[s.pickerText, { color: colors.text }]}>{origin.name}</Text></>
              ) : (
                <Text style={[s.pickerText, { color: colors.textMuted }]}>Choose origin country</Text>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={[s.sectionLabel, { color: colors.text }]}>To</Text>
            <TouchableOpacity
              style={[s.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setStage("destination")}
            >
              {destination ? (
                <><Text style={s.countryFlag}>{destination.flag}</Text><Text style={[s.pickerText, { color: colors.text }]}>{destination.name}</Text></>
              ) : (
                <Text style={[s.pickerText, { color: colors.textMuted }]}>Choose destination country</Text>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.continueBtn, (!origin || !destination || searching) && { opacity: 0.4 }]}
            onPress={handleSearch}
            disabled={!origin || !destination || searching}
          >
            {searching ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={s.continueBtnText}>Search {mode === "bus" ? "Buses" : "Flights"}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Origin / Destination country pickers ─────────────────────────────────────
  if (stage === "origin" || stage === "destination") {
    const isOrigin = stage === "origin";
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header(isOrigin ? "Origin Country" : "Destination Country", () => setStage("search"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
          {ALL_COUNTRIES.map(c => (
            <TouchableOpacity
              key={c.code}
              style={[s.countryChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => { isOrigin ? setOrigin(c) : setDestination(c); setStage("search"); }}
            >
              <Text style={s.countryFlag}>{c.flag}</Text>
              <Text style={[s.countryName, { color: colors.text }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (stage === "results") {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header(`${origin?.name} → ${destination?.name}`, () => setStage("search"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {results.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name={mode === "bus" ? "bus-outline" : "airplane-outline"} size={40} color={colors.textMuted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>No departures found</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>Try a different route or check back later</Text>
            </View>
          ) : (
            results.map((dep) => (
              <TouchableOpacity
                key={dep.departureId}
                style={[s.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleSelectDeparture(dep)}
                activeOpacity={0.75}
              >
                <View style={s.resultTop}>
                  <Text style={[s.resultOperator, { color: colors.text }]}>{dep.operatorName}</Text>
                  <Text style={[s.resultPrice, { color: PRIMARY }]}>
                    {getCurrency(dep.currency).symbol}{parseFloat(dep.price).toFixed(2)}
                  </Text>
                </View>
                <Text style={[s.resultRoute, { color: colors.textSecondary }]}>
                  {dep.originCity} → {dep.destinationCity}{dep.flightNumber ? ` · ${dep.flightNumber}` : ""}
                </Text>
                <View style={s.resultBottom}>
                  <Text style={[s.resultDate, { color: colors.textMuted }]}>
                    {format(new Date(dep.departureAt), "EEE, MMM d · HH:mm")}
                  </Text>
                  <Text style={[s.resultSeats, { color: dep.seatsAvailable > 5 ? GREEN : "#F59E0B" }]}>
                    {dep.seatsAvailable} seat{dep.seatsAvailable === 1 ? "" : "s"} left
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Passengers ─────────────────────────────────────────────────────────────
  if (stage === "passengers" && selectedDeparture) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Passenger Details", () => setStage("results"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {mode === "flight" && selectedDeparture.businessPrice && (
            <View>
              <Text style={[s.sectionLabel, { color: colors.text }]}>Class</Text>
              <View style={[s.modeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {(["economy", "business"] as const).map(cls => (
                  <TouchableOpacity
                    key={cls}
                    style={[s.modeBtn, seatClass === cls && { backgroundColor: PRIMARY }]}
                    onPress={() => setSeatClass(cls)}
                  >
                    <Text style={[s.modeBtnText, { color: seatClass === cls ? "#fff" : colors.textSecondary, textTransform: "capitalize" }]}>
                      {cls}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {passengers.map((pax, i) => (
            <View key={i} style={[s.passengerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.passengerHeader}>
                <Text style={[s.passengerTitle, { color: colors.text }]}>Passenger {i + 1}</Text>
                {passengers.length > 1 && (
                  <TouchableOpacity onPress={() => removePassenger(i)}>
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Full name"
                placeholderTextColor={colors.textMuted}
                value={pax.name}
                onChangeText={(v) => updatePassenger(i, "name", v)}
              />
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="ID / Passport number (optional)"
                placeholderTextColor={colors.textMuted}
                value={pax.idNumber}
                onChangeText={(v) => updatePassenger(i, "idNumber", v)}
              />
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder="Phone (optional)"
                placeholderTextColor={colors.textMuted}
                value={pax.phone}
                onChangeText={(v) => updatePassenger(i, "phone", v)}
                keyboardType="phone-pad"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[s.addPassengerBtn, { borderColor: PRIMARY }]}
            onPress={addPassenger}
            disabled={passengers.length >= selectedDeparture.seatsAvailable}
          >
            <Ionicons name="add" size={18} color={PRIMARY} />
            <Text style={[s.addPassengerText, { color: PRIMARY }]}>Add another passenger</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.continueBtn} onPress={handlePassengersContinue}>
            <Text style={s.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Payment ────────────────────────────────────────────────────────────────
  if (stage === "payment" && selectedDeparture) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header("Payment", () => setStage("passengers"))}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={[s.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[s.summaryRoute, { color: colors.text }]}>
              {selectedDeparture.originCity} → {selectedDeparture.destinationCity}
            </Text>
            <Text style={[s.summarySub, { color: colors.textMuted }]}>
              {format(new Date(selectedDeparture.departureAt), "EEE, MMM d · HH:mm")} · {passengers.length} passenger{passengers.length > 1 ? "s" : ""}
            </Text>
            <View style={[s.confirmDivider, { backgroundColor: colors.divider }]} />
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.textMuted }]}>Price per person</Text>
              <Text style={[s.confirmValue, { color: colors.text }]}>{getCurrency(selectedDeparture.currency).symbol}{unitPrice.toFixed(2)}</Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={[s.confirmLabel, { color: colors.text, fontWeight: "700" }]}>Total</Text>
              <Text style={[s.confirmValue, { color: PRIMARY, fontWeight: "800", fontSize: 16 }]}>
                {getCurrency(selectedDeparture.currency).symbol}{total.toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={[s.sectionLabel, { color: colors.text }]}>Pay with</Text>
          {cardsLoading ? (
            <ActivityIndicator color={PRIMARY} />
          ) : matchingCards.length === 0 ? (
            <View style={[s.noCardWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={22} color="#F59E0B" />
              <Text style={[s.noCardText, { color: colors.textSecondary }]}>
                You don't have a {selectedDeparture.currency} wallet yet. Top up or create one to book this ticket.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {matchingCards.map((card: any) => (
                <TouchableOpacity
                  key={card.id}
                  style={[s.cardOption, { borderColor: colors.border, backgroundColor: colors.surface },
                    selectedCardId === card.id && { borderColor: PRIMARY, backgroundColor: colors.primaryLight }]}
                  onPress={() => setSelectedCardId(card.id)}
                >
                  <Ionicons name="card" size={16} color={selectedCardId === card.id ? PRIMARY : colors.textMuted} />
                  <Text style={[s.cardOptionText, { color: colors.text }]}>{card.title}</Text>
                  <Text style={[s.cardOptionBalance, { color: colors.textMuted }]}>
                    {getCurrency(card.currency).symbol}{parseFloat(card.balance).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[s.sendBtn, (!selectedCardId || booking || (selectedCard && parseFloat(selectedCard.balance) < total)) && { opacity: 0.4 }]}
            onPress={handleBook}
            disabled={!selectedCardId || booking || (selectedCard && parseFloat(selectedCard.balance) < total)}
          >
            {booking ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={s.sendBtnText}>Book · {getCurrency(selectedDeparture.currency).symbol}{total.toFixed(2)}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={s.successWrap}>
        <View style={s.successCircle}>
          <Ionicons name="checkmark" size={52} color="#fff" />
        </View>
        <Text style={[s.successTitle, { color: colors.text }]}>Booked!</Text>
        <Text style={[s.successSub, { color: colors.textMuted }]}>Your ticket is in Purchases</Text>

        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => router.push(`/(screens)/purchase-detail?id=${bookedTransaction?.id}` as any)}
        >
          <Text style={s.doneBtnText}>View Ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.push("/(tabs)" as any)}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingBottom: 18, paddingHorizontal: 20,
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },

  modeRow: { flexDirection: "row", borderRadius: 14, borderWidth: 1.5, padding: 4, gap: 4 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnText: { fontSize: 14, fontWeight: "700" },

  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 14,
  },
  pickerText: { flex: 1, fontSize: 15, fontWeight: "600" },

  countryChip: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 12 },
  countryFlag: { fontSize: 22 },
  countryName: { fontSize: 14, fontWeight: "700" },

  continueBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  continueBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 13, textAlign: "center" },

  resultCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 6 },
  resultTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultOperator: { fontSize: 15, fontWeight: "700" },
  resultPrice: { fontSize: 17, fontWeight: "800" },
  resultRoute: { fontSize: 13, fontWeight: "500" },
  resultBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  resultDate: { fontSize: 12 },
  resultSeats: { fontSize: 12, fontWeight: "700" },

  passengerCard: { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 10 },
  passengerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  passengerTitle: { fontSize: 14, fontWeight: "700" },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },

  addPassengerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 12,
  },
  addPassengerText: { fontSize: 14, fontWeight: "700" },

  summaryCard: { borderRadius: 18, padding: 18 },
  summaryRoute: { fontSize: 17, fontWeight: "800" },
  summarySub: { fontSize: 12, marginTop: 4 },
  confirmDivider: { height: 1, marginVertical: 12 },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  confirmLabel: { fontSize: 14 },
  confirmValue: { fontSize: 14, fontWeight: "600" },

  noCardWrap: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  noCardText: { flex: 1, fontSize: 13, lineHeight: 18 },

  cardOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
  },
  cardOptionText: { flex: 1, fontSize: 14, fontWeight: "600" },
  cardOptionBalance: { fontSize: 12 },

  sendBtn: {
    backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  successCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: GREEN,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  successTitle: { fontSize: 28, fontWeight: "900", marginBottom: 8 },
  successSub: { fontSize: 15, marginBottom: 32 },
  doneBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40 },
  doneBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
