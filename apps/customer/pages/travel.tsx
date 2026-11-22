/**
 * Flights. Search airports and dates, compare fares from every airline
 * source BukkaPay is connected to (our own inventory + airline APIs), enter
 * passengers exactly as on their ID/passport, and pay from a wallet with the
 * transaction PIN. Bus tickets are no longer sold.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useToast } from "../hooks/use-toast";
import {
  bookFlight, fetchCards, searchAirports, searchFlights,
  type Airport, type Cabin, type FlightOffer, type Traveller,
} from "../lib/api";
import PinPrompt from "../components/PinPrompt";
import { getCurrency } from "../lib/currency";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const CABINS: { value: Cabin; label: string }[] = [
  { value: "economy", label: "Economy" }, { value: "premium_economy", label: "Premium" },
  { value: "business", label: "Business" }, { value: "first", label: "First" },
];
const TITLES = ["mr", "ms", "mrs", "miss", "dr"];
type Stage = "search" | "results" | "travellers" | "pay" | "success";
type Kind = "adult" | "child" | "infant_without_seat";

const DEFAULT_FROM: Airport = { iata: "JNB", name: "O. R. Tambo International", city: "Johannesburg", countryCode: "ZA" };
const DEFAULT_TO: Airport = { iata: "CPT", name: "Cape Town International", city: "Cape Town", countryCode: "ZA" };

const blankTraveller = (): Traveller => ({
  title: "", givenName: "", familyName: "", bornOn: "", gender: "", email: "", phone: "",
});

const time = (iso: string) => format(new Date(iso), "HH:mm");
const dur = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export default function Flights() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors } = useTheme();

  const [stage, setStage] = useState<Stage>("search");
  const [from, setFrom] = useState<Airport>(DEFAULT_FROM);
  const [to, setTo] = useState<Airport>(DEFAULT_TO);
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const [day, setDay] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [cabin, setCabin] = useState<Cabin>("economy");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [searching, setSearching] = useState(false);
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [offer, setOffer] = useState<FlightOffer | null>(null);
  const [travellers, setTravellers] = useState<Traveller[]>([]);
  const [cardId, setCardId] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [booked, setBooked] = useState<any | null>(null);

  const international = from.countryCode !== to.countryCode;
  const kinds: Kind[] = useMemo(() => [
    ...Array(adults).fill("adult"), ...Array(children).fill("child"), ...Array(infants).fill("infant_without_seat"),
  ], [adults, children, infants]);

  const { data: cards = [] } = useQuery({ queryKey: ["cards"], queryFn: fetchCards });
  const payable = (cards as any[]).filter((c) => !offer || c.currency === offer.currency);
  useEffect(() => {
    if (payable.length && !payable.find((c) => c.id === cardId)) setCardId(payable[0].id);
  }, [offer, cards]);

  const header = (title: string, onBack: () => void) => (
    <View style={[st.header, { backgroundColor: PRIMARY }]}>
      <TouchableOpacity onPress={onBack} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
      <Text style={st.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  const search = async () => {
    if (from.iata === to.iata) return toast({ title: "Choose two different airports", variant: "destructive" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return toast({ title: "Enter the date as YYYY-MM-DD", variant: "destructive" });
    setSearching(true);
    try {
      setOffers(await searchFlights({ origin: from.iata, destination: to.iata, date: day, adults, children, infants, cabin }));
      setStage("results");
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally { setSearching(false); }
  };

  const choose = (o: FlightOffer) => {
    setOffer(o);
    setTravellers(kinds.map(() => blankTraveller()));
    setStage("travellers");
  };

  const setT = (i: number, patch: Partial<Traveller>) =>
    setTravellers((list) => list.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const travellersOk = () => {
    for (const [i, t] of travellers.entries()) {
      const n = `Passenger ${i + 1}`;
      if (!t.title || !t.givenName.trim() || !t.familyName.trim()) return `${n}: title and full name`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.bornOn)) return `${n}: date of birth as YYYY-MM-DD`;
      if (!t.gender) return `${n}: gender as on the passport`;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.email)) return `${n}: a valid email`;
      if (!/^\+[1-9]\d{6,14}$/.test(t.phone.replace(/[\s-]/g, ""))) return `${n}: phone with country code, e.g. +27821234567`;
      if (international && (!t.document?.number || !/^\d{4}-\d{2}-\d{2}$/.test(t.document?.expiresOn || "") || !/^[A-Za-z]{2}$/.test(t.document?.issuingCountry || "")))
        return `${n}: passport number, issuing country (2 letters) and expiry`;
    }
    return null;
  };

  const pay = async (pin: string) => {
    if (!offer) return;
    const res = await bookFlight({
      offerId: offer.id, fromCardId: cardId, pin, adults, children, infants,
      travellers: travellers.map((t) => ({
        ...t, phone: t.phone.replace(/[\s-]/g, ""),
        ...(international ? {} : { document: undefined }),
      })),
    });
    setBooked(res);
    setPinOpen(false);
    setStage("success");
  };

  const counter = (label: string, sub: string, value: number, set: (n: number) => void, min: number, max: number) => (
    <View style={st.counterRow}>
      <View style={{ flex: 1 }}>
        <Text style={[st.counterLabel, { color: colors.text }]}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{sub}</Text>
      </View>
      <TouchableOpacity onPress={() => set(Math.max(min, value - 1))} style={[st.step, { borderColor: colors.border }]} accessibilityLabel={`Fewer ${label}`}><Ionicons name="remove" size={18} color={colors.text} /></TouchableOpacity>
      <Text style={[st.counterValue, { color: colors.text }]}>{value}</Text>
      <TouchableOpacity onPress={() => set(Math.min(max, value + 1))} style={[st.step, { borderColor: colors.border }]} accessibilityLabel={`More ${label}`}><Ionicons name="add" size={18} color={colors.text} /></TouchableOpacity>
    </View>
  );

  // ── Search ────────────────────────────────────────────────────────────────
  if (stage === "search") {
    return (
      <View style={[st.container, { backgroundColor: colors.background }]}>
        {header("Book a flight", () => router.back())}
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <AirportField label="From" airport={from} onPress={() => setPicking("from")} />
            <TouchableOpacity style={st.swap} onPress={() => { setFrom(to); setTo(from); }} accessibilityLabel="Swap airports">
              <Ionicons name="swap-vertical" size={20} color={PRIMARY} />
            </TouchableOpacity>
            <AirportField label="To" airport={to} onPress={() => setPicking("to")} />
          </View>

          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.label, { color: colors.textMuted }]}>Departure date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
              {Array.from({ length: 21 }, (_, i) => addDays(new Date(), i + 1)).map((d) => {
                const v = format(d, "yyyy-MM-dd");
                const on = v === day;
                return (
                  <TouchableOpacity key={v} onPress={() => setDay(v)} style={[st.dayChip, { borderColor: on ? PRIMARY : colors.border, backgroundColor: on ? PRIMARY : "transparent" }]}>
                    <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 11 }}>{format(d, "EEE")}</Text>
                    <Text style={{ color: on ? "#fff" : colors.text, fontWeight: "700" }}>{format(d, "d MMM")}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
              style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Departure date" />
          </View>

          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.label, { color: colors.textMuted }]}>Cabin</Text>
            <View style={st.chips}>
              {CABINS.map((c) => (
                <TouchableOpacity key={c.value} onPress={() => setCabin(c.value)} style={[st.chip, { borderColor: cabin === c.value ? PRIMARY : colors.border, backgroundColor: cabin === c.value ? PRIMARY : "transparent" }]}>
                  <Text style={{ color: cabin === c.value ? "#fff" : colors.text, fontWeight: "600" }}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {counter("Adults", "12 years and over", adults, setAdults, 1, 9 - children - infants)}
            {counter("Children", "2–11 years", children, setChildren, 0, 9 - adults - infants)}
            {counter("Infants", "Under 2, on a lap", infants, setInfants, 0, Math.min(adults, 9 - adults - children))}
          </View>

          <TouchableOpacity style={[st.primary, searching && { opacity: 0.6 }]} onPress={search} disabled={searching}>
            {searching ? <ActivityIndicator color="#fff" /> : <><Ionicons name="search" size={18} color="#fff" /><Text style={st.primaryText}>Search flights</Text></>}
          </TouchableOpacity>
          <Text style={[st.note, { color: colors.textMuted }]}>Fares from BukkaPay's airline partners. Prices include taxes; you pay from your wallet with your PIN.</Text>
        </ScrollView>
        <AirportPicker visible={picking !== null} onClose={() => setPicking(null)}
          onPick={(a) => { picking === "from" ? setFrom(a) : setTo(a); setPicking(null); }} />
      </View>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (stage === "results") {
    return (
      <View style={[st.container, { backgroundColor: colors.background }]}>
        {header(`${from.iata} → ${to.iata}`, () => setStage("search"))}
        <ScrollView contentContainerStyle={st.body}>
          <Text style={[st.note, { color: colors.textMuted, marginBottom: 8 }]}>
            {format(new Date(day), "EEE d MMM yyyy")} · {kinds.length} passenger{kinds.length > 1 ? "s" : ""} · {CABINS.find((c) => c.value === cabin)?.label}
          </Text>
          {offers.length === 0 && (
            <View style={st.empty}>
              <Ionicons name="airplane-outline" size={40} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: "600", marginTop: 8 }}>No flights for that search</Text>
              <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 4 }}>Try another date, cabin or nearby airport.</Text>
            </View>
          )}
          {offers.map((o) => (
            <TouchableOpacity key={o.id} onPress={() => choose(o)} style={[st.offer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.offerTop}>
                <Text style={[st.airline, { color: colors.text }]}>{o.airlineName}</Text>
                <Text style={[st.price, { color: PRIMARY }]}>{getCurrency(o.currency).symbol}{Number(o.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={st.offerMid}>
                <View><Text style={[st.time, { color: colors.text }]}>{time(o.departingAt)}</Text><Text style={{ color: colors.textMuted }}>{o.origin}</Text></View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dur(o.durationMinutes)}</Text>
                  <View style={[st.line, { backgroundColor: colors.border }]} />
                  <Text style={{ color: o.stops ? "#D97706" : "#059669", fontSize: 12, fontWeight: "600" }}>{o.stops ? `${o.stops} stop${o.stops > 1 ? "s" : ""}` : "Direct"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}><Text style={[st.time, { color: colors.text }]}>{time(o.arrivingAt)}</Text><Text style={{ color: colors.textMuted }}>{o.destination}</Text></View>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {o.segments.map((s) => s.flightNumber).filter(Boolean).join(" · ")}
                {o.refundable === false ? " · Non-refundable" : o.refundable ? " · Refundable" : ""}
                {o.seatsLeft != null && o.seatsLeft <= 5 ? ` · ${o.seatsLeft} seats left` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Travellers ────────────────────────────────────────────────────────────
  if (stage === "travellers" && offer) {
    return (
      <View style={[st.container, { backgroundColor: colors.background }]}>
        {header("Passengers", () => setStage("results"))}
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <Text style={[st.note, { color: colors.textMuted, marginBottom: 8 }]}>Enter names exactly as on each {international ? "passport" : "ID or passport"}. Airlines can refuse boarding if they don't match.</Text>
          {travellers.map((t, i) => (
            <View key={i} style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[st.cardTitle, { color: colors.text }]}>Passenger {i + 1} · {kinds[i] === "adult" ? "Adult" : kinds[i] === "child" ? "Child" : "Infant"}</Text>
              <View style={st.chips}>
                {TITLES.map((x) => (
                  <TouchableOpacity key={x} onPress={() => setT(i, { title: x })} style={[st.chip, { borderColor: t.title === x ? PRIMARY : colors.border, backgroundColor: t.title === x ? PRIMARY : "transparent" }]}>
                    <Text style={{ color: t.title === x ? "#fff" : colors.text, textTransform: "capitalize" }}>{x}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="First and middle names" value={t.givenName} onChange={(v) => setT(i, { givenName: v })} />
              <Field label="Last name" value={t.familyName} onChange={(v) => setT(i, { familyName: v })} />
              <Field label="Date of birth (YYYY-MM-DD)" value={t.bornOn} onChange={(v) => setT(i, { bornOn: v })} />
              <View style={st.chips}>
                {(["f", "m"] as const).map((g) => (
                  <TouchableOpacity key={g} onPress={() => setT(i, { gender: g })} style={[st.chip, { borderColor: t.gender === g ? PRIMARY : colors.border, backgroundColor: t.gender === g ? PRIMARY : "transparent" }]}>
                    <Text style={{ color: t.gender === g ? "#fff" : colors.text }}>{g === "f" ? "Female" : "Male"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Email" value={t.email} onChange={(v) => setT(i, { email: v })} keyboard="email-address" />
              <Field label="Phone with country code (+27…)" value={t.phone} onChange={(v) => setT(i, { phone: v })} keyboard="phone-pad" />
              {international && (
                <>
                  <Field label="Passport number" value={t.document?.number ?? ""} onChange={(v) => setT(i, { document: { ...(t.document ?? { issuingCountry: "", expiresOn: "" }), number: v } as any })} />
                  <Field label="Issuing country (2 letters, e.g. ZA)" value={t.document?.issuingCountry ?? ""} onChange={(v) => setT(i, { document: { ...(t.document ?? { number: "", expiresOn: "" }), issuingCountry: v.toUpperCase().slice(0, 2) } as any })} />
                  <Field label="Passport expiry (YYYY-MM-DD)" value={t.document?.expiresOn ?? ""} onChange={(v) => setT(i, { document: { ...(t.document ?? { number: "", issuingCountry: "" }), expiresOn: v } as any })} />
                </>
              )}
            </View>
          ))}
          <TouchableOpacity style={st.primary} onPress={() => {
            const problem = travellersOk();
            if (problem) return toast({ title: "Check passenger details", description: problem, variant: "destructive" });
            setStage("pay");
          }}>
            <Text style={st.primaryText}>Continue to payment</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Pay ───────────────────────────────────────────────────────────────────
  if (stage === "pay" && offer) {
    const sym = getCurrency(offer.currency).symbol;
    return (
      <View style={[st.container, { backgroundColor: colors.background }]}>
        {header("Review and pay", () => setStage("travellers"))}
        <ScrollView contentContainerStyle={st.body}>
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.cardTitle, { color: colors.text }]}>{offer.airlineName}</Text>
            <Text style={{ color: colors.text }}>{offer.origin} {time(offer.departingAt)} → {offer.destination} {time(offer.arrivingAt)}</Text>
            <Text style={{ color: colors.textMuted }}>{format(new Date(offer.departingAt), "EEE d MMM yyyy")} · {dur(offer.durationMinutes)} · {offer.stops ? `${offer.stops} stop(s)` : "Direct"}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 6 }}>{travellers.map((t) => `${t.givenName} ${t.familyName}`).join(", ")}</Text>
            {offer.refundable === false && <Text style={{ color: "#D97706", marginTop: 6 }}>This fare is non-refundable.</Text>}
          </View>
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.label, { color: colors.textMuted }]}>Pay from</Text>
            {payable.length === 0 && <Text style={{ color: "#DC2626", marginTop: 6 }}>You need a {offer.currency} wallet to pay for this fare.</Text>}
            {payable.map((c: any) => (
              <TouchableOpacity key={c.id} onPress={() => setCardId(c.id)} style={[st.walletRow, { borderColor: cardId === c.id ? PRIMARY : colors.border }]}>
                <Text style={{ color: colors.text, flex: 1 }}>{c.title}</Text>
                <Text style={{ color: colors.textMuted }}>{sym}{Number(c.balance).toFixed(2)}</Text>
                {cardId === c.id && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.totalRow}>
            <Text style={{ color: colors.text, fontSize: 16 }}>Total</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{sym}{Number(offer.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</Text>
          </View>
          <TouchableOpacity style={[st.primary, !cardId && { opacity: 0.5 }]} disabled={!cardId} onPress={() => setPinOpen(true)}>
            <Ionicons name="lock-closed" size={18} color="#fff" /><Text style={st.primaryText}>Pay and book</Text>
          </TouchableOpacity>
          <PinPrompt visible={pinOpen} title="Confirm booking" onCancel={() => setPinOpen(false)} onSubmit={pay} />
        </ScrollView>
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  const m = booked?.metadata ?? {};
  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {header("Booked", () => router.back())}
      <ScrollView contentContainerStyle={[st.body, { alignItems: "center" }]}>
        <Ionicons name="checkmark-circle" size={72} color="#10B981" />
        <Text style={[st.cardTitle, { color: colors.text, fontSize: 22, marginTop: 8 }]}>You're booked!</Text>
        <Text style={{ color: colors.textMuted }}>Booking reference</Text>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: 4, marginVertical: 6 }}>{m.bookingReference}</Text>
        <Text style={{ color: colors.text }}>{m.airline} · {m.fromCode} → {m.toCode}</Text>
        <Text style={{ color: colors.textMuted }}>{m.travelDate} · departs {m.departure}</Text>
        <TouchableOpacity style={[st.primary, { alignSelf: "stretch", marginTop: 24 }]} onPress={() => booked && router.push({ pathname: "/(screens)/purchase-detail", params: { id: booked.id } } as any)}>
          <Text style={st.primaryText}>View ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setStage("search"); setOffer(null); setBooked(null); }} style={{ marginTop: 14 }}>
          <Text style={{ color: PRIMARY, fontWeight: "600" }}>Book another flight</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function AirportField({ label, airport, onPress }: { label: string; airport: Airport; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} style={st.airportField} accessibilityLabel={`${label}: ${airport.city}`}>
      <Text style={[st.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{airport.iata}</Text>
      <Text style={{ color: colors.textMuted }} numberOfLines={1}>{airport.city} · {airport.name}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (v: string) => void; keyboard?: any }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={[st.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} autoCapitalize={keyboard === "email-address" ? "none" : "words"}
        style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel={label} />
    </View>
  );
}

function AirportPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (a: Airport) => void }) {
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const { data = [], isFetching } = useQuery({ queryKey: ["airports", q], queryFn: () => searchAirports(q), enabled: visible });
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[st.container, { backgroundColor: colors.background }]}>
        <View style={[st.header, { backgroundColor: PRIMARY }]}>
          <TouchableOpacity onPress={onClose} style={st.back} accessibilityLabel="Close"><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
          <Text style={st.headerTitle}>Choose airport</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: 16 }}>
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="City, airport or code" placeholderTextColor={colors.textMuted}
            style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Search airports" />
        </View>
        {isFetching && <ActivityIndicator color={PRIMARY} />}
        <ScrollView keyboardShouldPersistTaps="handled">
          {data.map((a) => (
            <TouchableOpacity key={a.iata} onPress={() => onPick(a)} style={[st.airportRow, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "800", width: 52 }}>{a.iata}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text }}>{a.city}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{a.name} · {a.countryCode}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  airportField: { paddingVertical: 6 },
  swap: { alignSelf: "flex-end", padding: 6, marginVertical: -6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  dayChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, alignItems: "center" },
  counterRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  counterLabel: { fontSize: 15, fontWeight: "600" },
  counterValue: { width: 32, textAlign: "center", fontSize: 16, fontWeight: "700" },
  step: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  note: { fontSize: 12, lineHeight: 18 },
  empty: { alignItems: "center", padding: 32 },
  offer: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  offerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  airline: { fontSize: 15, fontWeight: "700", flex: 1 },
  price: { fontSize: 18, fontWeight: "800" },
  offerMid: { flexDirection: "row", alignItems: "center", gap: 12 },
  time: { fontSize: 20, fontWeight: "800" },
  line: { height: 2, alignSelf: "stretch", marginVertical: 4, borderRadius: 1 },
  walletRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  airportRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
