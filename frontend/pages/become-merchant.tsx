import { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, Image, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { useTheme } from "../lib/ThemeContext";
import * as ImagePicker from "expo-image-picker";

const businessTypes = [
  { id: "sme", label: "SME / Registered business", icon: "business" as const },
  { id: "tuckshop", label: "Tuckshop / Food stall", icon: "storefront" as const },
  { id: "street_vendor", label: "Street vendor / Informal trader", icon: "bag-handle" as const },
  { id: "taxi", label: "Taxi / Transport", icon: "car" as const },
  { id: "service", label: "Service provider", icon: "briefcase" as const },
  { id: "online", label: "Online seller", icon: "cube" as const },
  { id: "property", label: "Property / Rent collection", icon: "home" as const },
  { id: "school", label: "School / Organisation", icon: "school" as const },
  { id: "utility", label: "Municipality / Utility", icon: "water" as const },
  { id: "other", label: "Other", icon: "storefront" as const },
];

const propertySubcategories = [
  { id: "student_accommodation", label: "Student Accommodation", icon: "school" as const },
  { id: "flats", label: "Flats / Apartments", icon: "business" as const },
  { id: "residential", label: "Residential Houses", icon: "home" as const },
  { id: "rooms", label: "Rooms / Backyard Rooms", icon: "people" as const },
  { id: "commercial", label: "Commercial Property", icon: "storefront" as const },
  { id: "guest_house", label: "Guest House / B&B", icon: "bed" as const },
  { id: "other_property", label: "Other Property Type", icon: "business" as const },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    priceNum: 0,
    color: "#6B7280",
    features: [
      "QR Code Payments",
      "Up to 20 payment links/month",
      "Basic transaction stats",
      "WhatsApp share links",
      "BukkaPay badge on links",
    ],
    notIncluded: ["PDF / Document attachments", "Billing Pay Links", "Bulk sending", "Custom branding"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "R99/mo",
    priceNum: 99,
    color: "#7C3AED",
    badge: "POPULAR",
    features: [
      "Everything in Starter",
      "Unlimited payment links",
      "PDF / Document attachments",
      "Business logo on links",
      "Priority support",
    ],
    notIncluded: ["Billing Pay Links", "Bulk recipient sending"],
  },
  {
    id: "business",
    name: "Business",
    price: "R299/mo",
    priceNum: 299,
    color: "#F59E0B",
    badge: "BEST VALUE",
    features: [
      "Everything in Pro",
      "Billing Pay Links (unlimited)",
      "Bulk send bills via Email & WhatsApp",
      "Custom branding & white-label",
      "Advanced analytics & reports",
    ],
    notIncluded: [],
  },
];

type Step = "intro" | "type" | "property_sub" | "details" | "plan" | "review";

export default function BecomeMerchant() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();

  const [step, setStep] = useState<Step>("intro");
  const [selectedType, setSelectedType] = useState("");
  const [selectedPropertySub, setSelectedPropertySub] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState("image/jpeg");
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const createMerchant = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/merchants", data),
    onSuccess: async (merchant: any) => {
      // Subscribe to selected plan
      if (selectedPlan !== "starter" && merchant?.id) {
        try {
          await apiRequest("POST", `/api/merchants/${merchant.id}/subscribe`, { plan: selectedPlan });
        } catch (_) {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      toast({ title: "Welcome aboard!", description: "Your merchant account is live." });
      router.push("/(screens)/merchant-dashboard" as any);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create merchant account" });
    },
  });

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo access to upload a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLogoUri(asset.uri);
      if (asset.base64) {
        setLogoBase64(asset.base64);
        setLogoMime(asset.mimeType || "image/jpeg");
      }
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoBase64) return null;
    setUploadingLogo(true);
    try {
      const res = await apiRequest("POST", "/api/upload", {
        base64: logoBase64,
        mimeType: logoMime,
        filename: "business-logo.jpg",
      }) as any;
      return res.url ?? null;
    } catch {
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      toast({ title: "Required", description: "Please enter your business name" });
      return;
    }
    let businessLogoUrl: string | null = null;
    if (logoBase64) {
      businessLogoUrl = await uploadLogo();
    }
    createMerchant.mutate({
      businessName: businessName.trim(),
      businessType: selectedType,
      businessCategory: selectedPropertySub || undefined,
      businessLogo: businessLogoUrl,
      businessEmail: businessEmail.trim() || undefined,
      businessPhone: businessPhone.trim() || undefined,
      businessAddress: businessAddress.trim() || undefined,
      businessRegNumber: businessRegNumber.trim() || undefined,
      vatNumber: vatNumber.trim() || undefined,
      website: website.trim() || undefined,
      subscriptionPlan: selectedPlan,
    });
  };

  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const card = darkMode ? "#1A1A2E" : "#FFFFFF";
  const border = darkMode ? "#2D2D44" : "#E5E7EB";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";

  const stepProgress = { intro: 0, type: 1, property_sub: 2, details: 3, plan: 4, review: 5 };
  const totalSteps = 5;
  const progress = stepProgress[step] / totalSteps;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => {
          const prev: Record<Step, Step | null> = {
            intro: null, type: "intro", property_sub: "type",
            details: selectedType === "property" ? "property_sub" : "type",
            plan: "details", review: "plan",
          };
          const p = prev[step];
          if (p) setStep(p);
          else router.back();
        }}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: text }]}>Become a Merchant</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress bar */}
      {step !== "intro" && (
        <View style={[s.progressBg, { backgroundColor: border }]}>
          <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: "#7C3AED" }]} />
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* ── INTRO ── */}
        {step === "intro" && (
          <View>
            <View style={[s.introBanner, { backgroundColor: "#7C3AED" }]}>
              <Ionicons name="storefront" size={56} color="#fff" />
              <Text style={s.introTitle}>Grow Your Business{"\n"}with BukkaPay</Text>
              <Text style={s.introSub}>Accept payments from anyone, anywhere — QR, payment links, and billing.</Text>
            </View>

            <View style={{ gap: 14, marginTop: 24 }}>
              {[
                { icon: "qr-code", color: "#7C3AED", title: "QR Code Payments", desc: "Customers scan to pay instantly" },
                { icon: "link", color: "#3B82F6", title: "Payment Links", desc: "Share links via WhatsApp or social" },
                { icon: "document-text", color: "#10B981", title: "Invoice Attachments", desc: "Attach PDFs and documents to links" },
                { icon: "receipt", color: "#F59E0B", title: "Billing Pay Links", desc: "Send utility and municipal bills digitally" },
                { icon: "bar-chart", color: "#EF4444", title: "Live Analytics", desc: "Track every payment in real-time" },
              ].map((b) => (
                <View key={b.title} style={[s.benefitRow, { backgroundColor: card, borderColor: border }]}>
                  <View style={[s.benefitIcon, { backgroundColor: b.color + "20" }]}>
                    <Ionicons name={b.icon as any} size={22} color={b.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.benefitTitle, { color: text }]}>{b.title}</Text>
                    <Text style={[s.benefitDesc, { color: sub }]}>{b.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[s.primaryBtn, { marginTop: 32 }]} onPress={() => setStep("type")}>
              <Text style={s.primaryBtnText}>Get Started →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── BUSINESS TYPE ── */}
        {step === "type" && (
          <View>
            <Text style={[s.stepTitle, { color: text }]}>What type of business?</Text>
            <Text style={[s.stepSub, { color: sub }]}>Choose the category that best fits your business.</Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              {businessTypes.map((bt) => (
                <TouchableOpacity
                  key={bt.id}
                  style={[s.typeRow, {
                    backgroundColor: card, borderColor: selectedType === bt.id ? "#7C3AED" : border,
                    borderWidth: selectedType === bt.id ? 2 : 1,
                  }]}
                  onPress={() => setSelectedType(bt.id)}
                >
                  <View style={[s.typeIcon, { backgroundColor: selectedType === bt.id ? "#7C3AED20" : border + "50" }]}>
                    <Ionicons name={bt.icon} size={20} color={selectedType === bt.id ? "#7C3AED" : sub} />
                  </View>
                  <Text style={[s.typeLabel, { color: text }]}>{bt.label}</Text>
                  {selectedType === bt.id && <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 24, opacity: selectedType ? 1 : 0.45 }]}
              disabled={!selectedType}
              onPress={() => {
                if (selectedType === "property") setStep("property_sub");
                else setStep("details");
              }}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PROPERTY SUBCATEGORY ── */}
        {step === "property_sub" && (
          <View>
            <Text style={[s.stepTitle, { color: text }]}>What kind of property?</Text>
            <Text style={[s.stepSub, { color: sub }]}>Help us tailor the experience for your property type.</Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              {propertySubcategories.map((pc) => (
                <TouchableOpacity
                  key={pc.id}
                  style={[s.typeRow, {
                    backgroundColor: card, borderColor: selectedPropertySub === pc.id ? "#7C3AED" : border,
                    borderWidth: selectedPropertySub === pc.id ? 2 : 1,
                  }]}
                  onPress={() => setSelectedPropertySub(pc.id)}
                >
                  <View style={[s.typeIcon, { backgroundColor: selectedPropertySub === pc.id ? "#7C3AED20" : border + "50" }]}>
                    <Ionicons name={pc.icon} size={20} color={selectedPropertySub === pc.id ? "#7C3AED" : sub} />
                  </View>
                  <Text style={[s.typeLabel, { color: text }]}>{pc.label}</Text>
                  {selectedPropertySub === pc.id && <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 24, opacity: selectedPropertySub ? 1 : 0.45 }]}
              disabled={!selectedPropertySub}
              onPress={() => setStep("details")}
            >
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── BUSINESS DETAILS ── */}
        {step === "details" && (
          <View>
            <Text style={[s.stepTitle, { color: text }]}>Business Details</Text>
            <Text style={[s.stepSub, { color: sub }]}>Add your business profile. Fields marked * are required.</Text>

            {/* Logo Upload */}
            <Text style={[s.fieldLabel, { color: text }]}>Business Logo</Text>
            <TouchableOpacity style={[s.logoUploadBox, { borderColor: border, backgroundColor: card }]} onPress={pickLogo}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={s.logoPreview} />
              ) : (
                <View style={{ alignItems: "center", gap: 8 }}>
                  <View style={[s.logoPlaceholder, { backgroundColor: "#7C3AED20" }]}>
                    <Ionicons name="camera" size={28} color="#7C3AED" />
                  </View>
                  <Text style={[s.logoUploadText, { color: sub }]}>Tap to upload logo</Text>
                  <Text style={[{ fontSize: 11, color: sub }]}>PNG, JPG — square recommended</Text>
                </View>
              )}
              {logoUri && (
                <View style={s.logoEditBadge}>
                  <Ionicons name="pencil" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <Text style={[s.fieldLabel, { color: text }]}>Business Name *</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="e.g. Mama's Kitchen"
              placeholderTextColor={sub}
              value={businessName}
              onChangeText={setBusinessName}
            />

            <Text style={[s.fieldLabel, { color: text }]}>Business Email</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="hello@mybusiness.co.za"
              placeholderTextColor={sub}
              keyboardType="email-address"
              autoCapitalize="none"
              value={businessEmail}
              onChangeText={setBusinessEmail}
            />

            <Text style={[s.fieldLabel, { color: text }]}>Business Phone</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="+27 XX XXX XXXX"
              placeholderTextColor={sub}
              keyboardType="phone-pad"
              value={businessPhone}
              onChangeText={setBusinessPhone}
            />

            <Text style={[s.fieldLabel, { color: text }]}>Business Address</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="Physical address"
              placeholderTextColor={sub}
              value={businessAddress}
              onChangeText={setBusinessAddress}
            />

            <Text style={[s.fieldLabel, { color: text }]}>Registration Number</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="e.g. 2023/123456/07"
              placeholderTextColor={sub}
              autoCapitalize="characters"
              value={businessRegNumber}
              onChangeText={setBusinessRegNumber}
            />

            <Text style={[s.fieldLabel, { color: text }]}>VAT Number</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="e.g. 4123456789"
              placeholderTextColor={sub}
              keyboardType="numeric"
              value={vatNumber}
              onChangeText={setVatNumber}
            />

            <Text style={[s.fieldLabel, { color: text }]}>Website</Text>
            <TextInput
              style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
              placeholder="https://www.mybusiness.co.za"
              placeholderTextColor={sub}
              keyboardType="url"
              autoCapitalize="none"
              value={website}
              onChangeText={setWebsite}
            />

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 24, opacity: businessName.trim() ? 1 : 0.45 }]}
              disabled={!businessName.trim()}
              onPress={() => setStep("plan")}
            >
              <Text style={s.primaryBtnText}>Continue to Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── SUBSCRIPTION PLAN ── */}
        {step === "plan" && (
          <View>
            <Text style={[s.stepTitle, { color: text }]}>Choose Your Plan</Text>
            <Text style={[s.stepSub, { color: sub }]}>Start free and upgrade anytime. No contracts.</Text>

            <View style={{ gap: 14, marginTop: 16 }}>
              {PLANS.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[s.planCard, {
                    backgroundColor: card,
                    borderColor: selectedPlan === plan.id ? plan.color : border,
                    borderWidth: selectedPlan === plan.id ? 2 : 1,
                  }]}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  <View style={s.planHeader}>
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[s.planName, { color: text }]}>{plan.name}</Text>
                        {plan.badge && (
                          <View style={[s.planBadge, { backgroundColor: plan.color }]}>
                            <Text style={s.planBadgeText}>{plan.badge}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.planPrice, { color: plan.color }]}>{plan.price}</Text>
                    </View>
                    <View style={[s.planRadio, {
                      borderColor: selectedPlan === plan.id ? plan.color : border,
                      backgroundColor: selectedPlan === plan.id ? plan.color : "transparent",
                    }]}>
                      {selectedPlan === plan.id && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </View>

                  <View style={[s.planDivider, { backgroundColor: border }]} />

                  <View style={{ gap: 6 }}>
                    {plan.features.map((f) => (
                      <View key={f} style={s.featureRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={[s.featureText, { color: text }]}>{f}</Text>
                      </View>
                    ))}
                    {plan.notIncluded?.map((f) => (
                      <View key={f} style={s.featureRow}>
                        <Ionicons name="close-circle" size={16} color={sub} />
                        <Text style={[s.featureText, { color: sub }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[s.primaryBtn, { marginTop: 24 }]} onPress={() => setStep("review")}>
              <Text style={s.primaryBtnText}>Review & Launch</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── REVIEW ── */}
        {step === "review" && (
          <View>
            <Text style={[s.stepTitle, { color: text }]}>Review & Launch</Text>
            <Text style={[s.stepSub, { color: sub }]}>Almost there! Confirm your merchant profile.</Text>

            <View style={[s.reviewCard, { backgroundColor: card, borderColor: border }]}>
              {logoUri && (
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <Image source={{ uri: logoUri }} style={s.reviewLogo} />
                </View>
              )}

              {[
                { label: "Business Name", value: businessName },
                { label: "Type", value: businessTypes.find(t => t.id === selectedType)?.label },
                { label: "Email", value: businessEmail || "—" },
                { label: "Phone", value: businessPhone || "—" },
                { label: "Address", value: businessAddress || "—" },
                { label: "Reg. Number", value: businessRegNumber || "—" },
                { label: "VAT Number", value: vatNumber || "—" },
                { label: "Website", value: website || "—" },
                { label: "Subscription", value: PLANS.find(p => p.id === selectedPlan)?.name + " — " + PLANS.find(p => p.id === selectedPlan)?.price },
              ].map((row) => (
                <View key={row.label} style={[s.reviewRow, { borderBottomColor: border }]}>
                  <Text style={[s.reviewLabel, { color: sub }]}>{row.label}</Text>
                  <Text style={[s.reviewValue, { color: text }]}>{row.value || "—"}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 24 }]}
              onPress={handleSubmit}
              disabled={createMerchant.isPending || uploadingLogo}
            >
              {(createMerchant.isPending || uploadingLogo) ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Launch My Merchant Account 🚀</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={{ alignItems: "center", marginTop: 12 }} onPress={() => setStep("plan")}>
              <Text style={[{ color: sub, fontSize: 13 }]}>← Go back and edit</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 48, paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  progressBg: { height: 3 },
  progressFill: { height: 3, borderRadius: 2 },
  introBanner: {
    borderRadius: 20, padding: 32, alignItems: "center", gap: 12,
  },
  introTitle: {
    fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center", lineHeight: 34,
  },
  introSub: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  benefitRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  benefitIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  benefitTitle: { fontSize: 14, fontWeight: "700" },
  benefitDesc: { fontSize: 12, marginTop: 1 },
  stepTitle: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  stepSub: { fontSize: 13, marginBottom: 4 },
  typeRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  typeIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "500",
  },
  logoUploadBox: {
    borderWidth: 2, borderStyle: "dashed", borderRadius: 16,
    height: 120, alignItems: "center", justifyContent: "center",
    marginBottom: 4, position: "relative", overflow: "hidden",
  },
  logoPreview: { width: "100%", height: "100%", borderRadius: 14 },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  logoUploadText: { fontSize: 13, fontWeight: "600" },
  logoEditBadge: {
    position: "absolute", bottom: 8, right: 8,
    backgroundColor: "#7C3AED", borderRadius: 10, padding: 4,
  },
  planCard: { borderRadius: 18, padding: 18, borderWidth: 1 },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  planName: { fontSize: 18, fontWeight: "800" },
  planPrice: { fontSize: 22, fontWeight: "900", marginTop: 2 },
  planBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start",
  },
  planBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  planRadio: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  planDivider: { height: 1, marginBottom: 12 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, flex: 1 },
  reviewCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden", padding: 16 },
  reviewLogo: { width: 80, height: 80, borderRadius: 16 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1 },
  reviewLabel: { fontSize: 12, fontWeight: "500", flex: 1 },
  reviewValue: { fontSize: 13, fontWeight: "600", flex: 2, textAlign: "right" },
  primaryBtn: {
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 15,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
