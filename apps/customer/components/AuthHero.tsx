import { Image, Platform, StyleSheet, Text, View } from "react-native";

const icon = require("../assets/logo.png");

/** Deep-blue brand header for the sign-in and sign-up screens. */
export default function AuthHero({ tagline = "Africa's money, without borders." }: { tagline?: string }) {
  return (
    <View style={st.hero}>
      <View style={[st.orb, { top: -120, right: -80, width: 280, height: 280, backgroundColor: "rgba(0,82,255,0.35)" }]} />
      <View style={[st.orb, { bottom: -140, left: -100, width: 300, height: 300, backgroundColor: "rgba(34,211,238,0.14)" }]} />
      <View style={st.inner}>
        <Image source={icon} style={st.icon} accessibilityLabel="BukkaPay" />
        <Text style={st.brand}>BukkaPay</Text>
        <Text style={st.tagline}>{tagline}</Text>
        <View style={st.chips}>
          {["ZAR · BWP · USD", "Free transfers", "Escrow for traders"].map((c) => (
            <View key={c} style={st.chip}><Text style={st.chipText}>{c}</Text></View>
          ))}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  hero: {
    backgroundColor: "#010C38", overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    paddingTop: Platform.OS === "ios" ? 72 : 56, paddingBottom: 64, paddingHorizontal: 24,
  },
  orb: { position: "absolute", borderRadius: 999 },
  inner: { alignItems: "center", maxWidth: 480, width: "100%", alignSelf: "center" },
  icon: { width: 72, height: 72, borderRadius: 18 },
  brand: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", marginTop: 14, letterSpacing: -0.5 },
  tagline: { color: "rgba(255,255,255,0.72)", fontSize: 15, marginTop: 4, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 18 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  chipText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
});
