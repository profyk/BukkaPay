/** Money insights: cash flow, where the money goes, who you pay, when you
 *  spend, plain-language insights and a monthly spending goal. Aggregated on
 *  the server per currency (GET /api/analytics). */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
// Validated reference palette (light / dark steps): slot 1 = money in, slot 2 = money out.
const SERIES = { light: { inn: "#2a78d6", out: "#eb6834", grid: "#e1e0d9", axis: "#898781" },
                 dark: { inn: "#3987e5", out: "#d95926", grid: "#2c2c2a", axis: "#898781" } };
const STATUS = { good: "#0ca30c", warn: "#d97706", info: "#2a78d6" };
const RANGES: [number, string][] = [[7, "Week"], [30, "Month"], [90, "3 months"], [365, "Year"]];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  food: "fast-food-outline", groceries: "cart-outline", transport: "car-outline", entertainment: "film-outline",
  bills: "document-text-outline", utilities: "flash-outline", transfer: "swap-horizontal-outline", shopping: "bag-outline",
  withdrawal: "cash-outline", topup: "add-circle-outline", payment: "card-outline", travel: "airplane-outline",
  account_fee: "receipt-outline", fee: "receipt-outline", other: "grid-outline",
};

type Analytics = {
  currencies: string[]; currency: string | null; days: number
  totals: { in: string; out: string; net: string; fees: string; transactions: number; averageDailySpend: string
            biggestExpense: string; inChange: number | null; outChange: number | null }
  daily: { date: string; in: string; out: string }[]
  categories: { category: string; amount: string; share: number; previous: string }[]
  payees: { name: string; amount: string; count: number }[]
  weekday: { day: number; amount: string }[]
  insights: { tone: "good" | "warn" | "info"; text: string }[]
};

async function fetchAnalytics(days: number, currency?: string): Promise<Analytics> {
  const q = new URLSearchParams({ days: String(days), ...(currency ? { currency } : {}) });
  const res = await fetch(`${API_BASE}/api/analytics?${q}`, { headers: await getAuthHeader() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't load your insights");
  return body;
}

const fmt = (ccy: string | null, v: string | number) =>
  `${ccy ?? ""} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

/** Group days into weeks (90 days) or months (a year) so bars stay readable. */
function bucket(daily: Analytics["daily"], days: number) {
  if (days <= 31) return daily.map((d) => ({ label: new Date(d.date).getDate().toString(), in: +d.in, out: +d.out, title: new Date(d.date).toLocaleDateString() }));
  const map = new Map<string, { label: string; in: number; out: number; title: string }>();
  for (const d of daily) {
    const dt = new Date(d.date);
    const key = days > 120 ? `${dt.getFullYear()}-${dt.getMonth()}` : `${dt.getFullYear()}-${Math.floor((dt.getTime() / 864e5 + 3) / 7)}`;
    const label = days > 120 ? dt.toLocaleDateString(undefined, { month: "short" }) : dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const b = map.get(key) ?? { label, in: 0, out: 0, title: days > 120 ? dt.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : `Week of ${dt.toLocaleDateString()}` };
    b.in += +d.in; b.out += +d.out; map.set(key, b);
  }
  return [...map.values()];
}

export default function Analytics() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();
  const pal = darkMode ? SERIES.dark : SERIES.light;
  const [days, setDays] = useState(30);
  const [currency, setCurrency] = useState<string | undefined>();
  const { data: a, isLoading, error } = useQuery({ queryKey: ["analytics", days, currency], queryFn: () => fetchAnalytics(days, currency) });
  const ccy = a?.currency ?? null;

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: PRIMARY }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={st.headerTitle}>Money insights</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.body}>
        <View style={st.chips}>
          {RANGES.map(([d, l]) => (
            <TouchableOpacity key={d} onPress={() => setDays(d)} style={[st.chip, { borderColor: days === d ? PRIMARY : colors.border, backgroundColor: days === d ? PRIMARY : "transparent" }]}>
              <Text style={{ color: days === d ? "#fff" : colors.text, fontWeight: "700" }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(a?.currencies.length ?? 0) > 1 && (
          <View style={st.chips}>
            {a!.currencies.map((c) => (
              <TouchableOpacity key={c} onPress={() => setCurrency(c)} style={[st.chipSm, { borderColor: ccy === c ? PRIMARY : colors.border }]}>
                <Text style={{ color: ccy === c ? PRIMARY : colors.textSecondary, fontWeight: "700" }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {isLoading && <ActivityIndicator color={PRIMARY} style={{ marginTop: 24 }} />}
        {error && <Text style={{ color: "#DC2626" }}>{(error as Error).message}</Text>}
        {a && a.currency && (
          <>
            <View style={[st.hero, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[st.label, { color: colors.textSecondary }]}>Net this period</Text>
              <Text style={[st.heroNum, { color: colors.text }]}>{Number(a.totals.net) >= 0 ? "+" : "−"}{fmt(ccy, Math.abs(Number(a.totals.net)))}</Text>
              <View style={st.row2}>
                <Tile color={pal.inn} icon="arrow-down" label="Money in" value={fmt(ccy, a.totals.in)} change={a.totals.inChange} goodWhenUp colors={colors} />
                <Tile color={pal.out} icon="arrow-up" label="Money out" value={fmt(ccy, a.totals.out)} change={a.totals.outChange} colors={colors} />
              </View>
            </View>

            <Goal ccy={ccy} spent={Number(a.totals.out)} days={days} colors={colors} />

            {!!a.insights.length && (
              <View style={{ gap: 8 }}>
                {a.insights.map((i) => (
                  <View key={i.text} style={[st.insight, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Ionicons name={i.tone === "good" ? "trending-down" : i.tone === "warn" ? "alert-circle-outline" : "bulb-outline"} size={20} color={STATUS[i.tone]} />
                    <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{i.text}</Text>
                  </View>
                ))}
              </View>
            )}

            <Card title="Cash flow" colors={colors}>
              <View style={st.legend}>
                <Legend color={pal.inn} label="In" colors={colors} /><Legend color={pal.out} label="Out" colors={colors} />
              </View>
              <CashFlow data={bucket(a.daily, days)} pal={pal} ccy={ccy} colors={colors} />
            </Card>

            <Card title="Where your money goes" colors={colors}>
              {!a.categories.length && <Text style={{ color: colors.textSecondary }}>No spending in this period.</Text>}
              {a.categories.slice(0, 8).map((c) => {
                const prev = Number(c.previous), now = Number(c.amount);
                const delta = prev ? Math.round(((now - prev) / prev) * 100) : null;
                return (
                  <View key={c.category} style={{ marginBottom: 12 }}>
                    <View style={st.catRow}>
                      <View style={[st.catIcon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name={ICONS[c.category] ?? ICONS.other} size={16} color={PRIMARY} />
                      </View>
                      <Text style={{ color: colors.text, flex: 1, fontWeight: "600", textTransform: "capitalize" }}>{c.category.replace(/_/g, " ")}</Text>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{fmt(ccy, c.amount)}</Text>
                    </View>
                    <View style={[st.track, { backgroundColor: colors.surface }]}>
                      <View style={[st.fill, { width: `${Math.max(2, c.share)}%`, backgroundColor: pal.inn }]} />
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {c.share}% of spending{delta !== null ? ` · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs before` : ""}
                    </Text>
                  </View>
                );
              })}
            </Card>

            <Card title="Spending by day of the week" colors={colors}>
              <Weekdays data={a.weekday} pal={pal} colors={colors} ccy={ccy} />
            </Card>

            <Card title="Who you pay most" colors={colors}>
              {!a.payees.length && <Text style={{ color: colors.textSecondary }}>No payments yet.</Text>}
              {a.payees.map((p, i) => (
                <View key={p.name} style={[st.payee, { borderColor: colors.divider }]}>
                  <Text style={{ color: colors.textMuted, width: 22, fontWeight: "700" }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{p.count} payment{p.count === 1 ? "" : "s"}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{fmt(ccy, p.amount)}</Text>
                </View>
              ))}
            </Card>

            <View style={st.row2}>
              <Mini label="Average a day" value={fmt(ccy, a.totals.averageDailySpend)} colors={colors} />
              <Mini label="Biggest payment" value={fmt(ccy, a.totals.biggestExpense)} colors={colors} />
            </View>
            <View style={st.row2}>
              <Mini label="Payments" value={String(a.totals.transactions)} colors={colors} />
              <Mini label="Fees paid" value={fmt(ccy, a.totals.fees)} colors={colors} />
            </View>
          </>
        )}
        {a && !a.currency && <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 24 }}>Open a wallet to see your insights.</Text>}
      </ScrollView>
    </View>
  );
}

function Tile({ color, icon, label, value, change, goodWhenUp, colors }: any) {
  const good = change === null ? null : goodWhenUp ? change >= 0 : change <= 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
        <Ionicons name={icon} size={12} color={colors.textSecondary} />
      </View>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 2 }}>{value}</Text>
      {change !== null && change !== undefined && (
        <Text style={{ color: good ? "#006300" : "#d03b3b", fontSize: 12, fontWeight: "600" }}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs before
        </Text>
      )}
    </View>
  );
}

function Card({ title, children, colors }: any) {
  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function Legend({ color, label, colors }: any) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
  </View>;
}

function Mini({ label, value, colors }: any) {
  return <View style={[st.mini, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 2 }}>{value}</Text>
  </View>;
}

function CashFlow({ data, pal, ccy, colors }: { data: { label: string; in: number; out: number; title: string }[]; pal: any; ccy: string | null; colors: any }) {
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState<number | null>(null);
  const w = Math.min(width - 64, 640), h = 170, padL = 36, padB = 18, ih = h - padB - 6;
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const step = (w - padL) / Math.max(1, data.length);
  const bw = Math.max(1.5, Math.min(10, step / 2 - 1.5));
  const y = (v: number) => 6 + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(data.length / 7));
  const s = sel !== null ? data[sel] : null;
  return (
    <View>
      <Svg width={w} height={h}>
        {[0, max / 2, max].map((t) => (
          <Line key={t} x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke={pal.grid} strokeWidth={1} />
        ))}
        {[0, max / 2, max].map((t) => (
          <SvgText key={`l${t}`} x={padL - 4} y={y(t) + 4} fontSize={10} fill={pal.axis} textAnchor="end">{compact(t)}</SvgText>
        ))}
        {data.map((d, i) => {
          const x0 = padL + i * step + step / 2 - bw - 1;
          const dim = sel !== null && sel !== i ? 0.45 : 1;
          return (
            <G key={i}>
              <Rect x={padL + i * step} y={0} width={step} height={h} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
              {d.in > 0 && <Path d={bar(x0, y(d.in), bw, 6 + ih - y(d.in))} fill={pal.inn} opacity={dim} />}
              {d.out > 0 && <Path d={bar(x0 + bw + 2, y(d.out), bw, 6 + ih - y(d.out))} fill={pal.out} opacity={dim} />}
              {i % every === 0 && <SvgText x={padL + i * step + step / 2} y={h - 4} fontSize={10} fill={pal.axis} textAnchor="middle">{d.label}</SvgText>}
            </G>
          );
        })}
      </Svg>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
        {s ? `${s.title}: in ${fmt(ccy, s.in)} · out ${fmt(ccy, s.out)}` : "Tap a bar for the amounts."}
      </Text>
    </View>
  );
}

function Weekdays({ data, pal, colors, ccy }: any) {
  const values = WEEKDAYS.map((_, i) => Number(data.find((d: any) => d.day === i + 1)?.amount ?? 0));
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 120 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <View style={{ width: "70%", height: Math.max(2, (v / max) * 90), backgroundColor: pal.inn, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: i === top ? 1 : 0.6 }}
                accessibilityLabel={`${WEEKDAYS[i]} ${fmt(ccy, v)}`} />
          <Text style={{ color: i === top ? colors.text : colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: i === top ? "800" : "500" }}>{WEEKDAYS[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function Goal({ ccy, spent, days, colors }: { ccy: string | null; spent: number; days: number; colors: any }) {
  const key = `spending-goal:${ccy}`;
  const [goal, setGoal] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { AsyncStorage.getItem(key).then((v) => setGoal(v ? Number(v) : null)); }, [key]);
  const monthly = useMemo(() => (days ? (spent / days) * 30 : 0), [spent, days]);
  const pct = goal ? Math.min(100, (monthly / goal) * 100) : 0;
  const over = goal !== null && monthly > goal;
  const save = async () => {
    const n = Number(draft);
    if (n > 0) { await AsyncStorage.setItem(key, String(n)); setGoal(n); } else { await AsyncStorage.removeItem(key); setGoal(null); }
    setEditing(false);
  };
  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>Monthly spending goal</Text>
        <TouchableOpacity onPress={() => { setDraft(goal ? String(goal) : ""); setEditing(!editing); }}>
          <Text style={{ color: PRIMARY, fontWeight: "700" }}>{goal ? "Change" : "Set a goal"}</Text>
        </TouchableOpacity>
      </View>
      {editing && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput value={draft} onChangeText={(t) => setDraft(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder={`${ccy} per month`}
            placeholderTextColor={colors.textMuted} style={[st.input, { color: colors.text, borderColor: colors.border }]} accessibilityLabel="Monthly goal" />
          <TouchableOpacity style={st.save} onPress={save}><Text style={{ color: "#fff", fontWeight: "700" }}>Save</Text></TouchableOpacity>
        </View>
      )}
      {goal ? (
        <>
          <View style={[st.track, { backgroundColor: colors.surface, marginTop: 12, height: 10 }]}>
            <View style={[st.fill, { width: `${pct}%`, height: 10, backgroundColor: over ? "#d03b3b" : "#0ca30c" }]} />
          </View>
          <Text style={{ color: colors.textSecondary, marginTop: 6 }}>
            {over ? "⚠ " : "✓ "}At this pace you'll spend {fmt(ccy, monthly)} a month, {over ? "over" : "within"} your {fmt(ccy, goal)} goal.
          </Text>
        </>
      ) : !editing && <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Set a monthly limit and we'll show how you're tracking. Saved on this phone only.</Text>}
    </View>
  );
}

function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 48, paddingBottom: 16, paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipSm: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 18 },
  heroNum: { fontSize: 32, fontWeight: "900", marginVertical: 6 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  row2: { flexDirection: "row", gap: 12, marginTop: 8 },
  insight: { flexDirection: "row", gap: 10, alignItems: "flex-start", borderWidth: 1, borderRadius: 14, padding: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  legend: { flexDirection: "row", gap: 16, marginBottom: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  catIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  track: { height: 8, borderRadius: 999, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
  payee: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  mini: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  save: { backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
});
