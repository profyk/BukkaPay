import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Switch,
  ActivityIndicator, StyleSheet, Platform, Image, Linking, Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";
import { getCurrentUser } from "../lib/auth";
import { useTheme } from "../lib/ThemeContext";

const PRIMARY = "#7C3AED";
const GREEN = "#10B981";
const CURRENCIES = ["ZAR","USD","EUR","GBP","NGN","KES","GHS","UGX"];
const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: "R", USD: "$", EUR: "€", GBP: "£", NGN: "₦", KES: "KSh", GHS: "₵", UGX: "USh",
};
const NUMPAD = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];
const SHARE_URL_BASE = "https://app.bukkapay.com/pay";

type Step = 1 | 2 | 3;

interface InvoiceItem { name: string; quantity: string; unitPrice: string; }

export default function CreatePaymentLink() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();

  const [step, setStep] = useState<Step>(1);

  // Step 1 — Amount & Details
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState("ZAR");
  const [description, setDescription] = useState("");

  // Step 2 — Options
  const [type, setType] = useState<"personal" | "business">("personal");
  const [senderName, setSenderName] = useState("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [region, setRegion] = useState<"local" | "africa" | "international">("local");
  const [subRegion, setSubRegion] = useState("");
  const [destination, setDestination] = useState<"wallet" | "bank">("wallet");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [bankCountry, setBankCountry] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [minimumPayment, setMinimumPayment] = useState("");
  const [hasInvoice, setHasInvoice] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{ name: "", quantity: "1", unitPrice: "" }]);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState(0);

  // Expanded option sections
  const [showTypeSection, setShowTypeSection] = useState(false);
  const [showRegionSection, setShowRegionSection] = useState(false);
  const [showDestSection, setShowDestSection] = useState(false);

  // Step 3 — Result
  const [isLoading, setIsLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user?.name) setSenderName(user.name);
    })();
  }, []);

  const sym = CURRENCY_SYMBOLS[currency] || currency;

  const handleNumpad = (key: string) => {
    if (key === "⌫") { setAmount(p => p.length <= 1 ? "0" : p.slice(0, -1)); return; }
    if (key === ".") { if (!amount.includes(".")) setAmount(p => p + "."); return; }
    if (amount.includes(".") && amount.split(".")[1]?.length >= 2) return;
    setAmount(p => p === "0" ? key : p + key);
  };

  const totalInvoice = items.reduce((s, i) =>
    s + (parseFloat(i.unitPrice) || 0) * (parseFloat(i.quantity) || 1), 0);

  const addItem = () => setItems([...items, { name: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: keyof InvoiceItem, v: string) => {
    const u = [...items]; u[i] = { ...u[i], [f]: v }; setItems(u);
  };

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.4, base64: true,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setBusinessLogo(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
    }
  };

  const pickAttachment = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const sizeKB = Math.round((asset.size || 0) / 1024);
      if (sizeKB > 4096) return;
      let base64: string;
      if (Platform.OS === "web") {
        const r = await fetch(asset.uri); const blob = await r.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      setAttachmentName(asset.name); setAttachmentData(base64); setAttachmentSize(sizeKB);
    } catch {}
  };

  const step1Valid = parseFloat(amount) > 0;
  const step2Valid = destination !== "bank" || (bankName.trim() && accountNumber.trim() && accountHolder.trim());

  const handleCreate = async () => {
    setIsLoading(true); setCreateError(null);
    try {
      const headers = await getAuthHeader();
      const body: any = {
        amount, currency, description,
        allowPartialPayment: allowPartial,
        minimumPayment: allowPartial ? minimumPayment : undefined,
        type, region,
        subRegion: subRegion || undefined,
        destination,
        bankDetails: destination === "bank" ? {
          bankName: bankName.trim(), accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
          branchCode: branchCode.trim() || undefined,
          country: bankCountry.trim() || undefined,
        } : undefined,
        businessName: type === "business"
          ? senderName.trim()
          : (senderName.trim() || undefined),
        businessLogo: businessLogo || undefined,
      };
      if (hasInvoice && customerName) {
        body.invoice = {
          customerName, customerEmail, customerPhone,
          type: "invoice", dueDate: dueDate || undefined, notes: invoiceNotes,
          items: items.filter(i => i.name.trim()).map(i => ({
            name: i.name, quantity: parseFloat(i.quantity) || 1, unitPrice: parseFloat(i.unitPrice) || 0,
          })),
          attachment: attachmentData ? {
            name: attachmentName, data: attachmentData,
            mimeType: attachmentName.endsWith(".pdf") ? "application/pdf" : `image/${attachmentName.split(".").pop()}`,
            sizeKB: attachmentSize,
          } : undefined,
        };
      }
      const res = await fetch(`${API_BASE}/api/payment-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to create link"); }
      const data = await res.json();
      setCreatedLink({ ...data, shareUrl: `${SHARE_URL_BASE}/${data.id}` });
      setStep(3);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!createdLink?.shareUrl) return;
    await Clipboard.setStringAsync(createdLink.shareUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!createdLink?.shareUrl) return;
    const text = encodeURIComponent(
      `Hi! ${senderName} is requesting ${currency} ${parseFloat(createdLink.amount).toFixed(2)}${description ? ` for "${description}"` : ""}.\n\nPay securely here 👇\n${createdLink.shareUrl}\n\n_Powered by BukkaPay_`
    );
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Linking.openURL(`https://api.whatsapp.com/send?text=${text}`)
    );
  };

  const shareEmail = () => {
    if (!createdLink?.shareUrl) return;
    const subject = encodeURIComponent(`Payment Request from ${senderName}`);
    const body = encodeURIComponent(
      `Hi,\n\n${senderName} is requesting ${currency} ${parseFloat(createdLink.amount).toFixed(2)}${description ? ` for "${description}"` : ""}.\n\nPay here: ${createdLink.shareUrl}\n\nPowered by BukkaPay`
    );
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareSMS = () => {
    if (!createdLink?.shareUrl) return;
    const text = encodeURIComponent(
      `${senderName} requests ${currency} ${parseFloat(createdLink.amount).toFixed(2)}. Pay here: ${createdLink.shareUrl}`
    );
    Linking.openURL(`sms:?body=${text}`);
  };

  const shareNative = async () => {
    if (!createdLink?.shareUrl) return;
    try {
      await Share.share({
        message: `Pay ${senderName} ${currency} ${parseFloat(createdLink.amount).toFixed(2)}: ${createdLink.shareUrl}`,
        url: createdLink.shareUrl,
      });
    } catch {}
  };

  const africaSubRegions = ["Southern", "Western", "Eastern", "Northern", "Central"];
  const intlSubRegions = ["USA", "Europe", "Asia", "Other"];

  // ── Step 1: Amount & Details ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <View style={[c.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[c.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={c.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[c.headerTitle, { color: colors.text }]}>Create Payment Link</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Step dots */}
        <View style={c.stepDots}>
          <View style={[c.dot, c.dotActive]} />
          <View style={[c.dot, { backgroundColor: colors.border }]} />
          <View style={[c.dot, { backgroundColor: colors.border }]} />
        </View>

        {/* Currency selector */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={c.currencyScroll} contentContainerStyle={c.currencyScrollInner}
        >
          {CURRENCIES.map(cur => (
            <TouchableOpacity
              key={cur}
              style={[c.currencyChip, { borderColor: colors.border, backgroundColor: colors.surface },
                currency === cur && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
              onPress={() => setCurrency(cur)}
            >
              <Text style={[c.currencyChipText, { color: currency === cur ? "#fff" : colors.textSecondary }]}>
                {CURRENCY_SYMBOLS[cur]} {cur}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Amount display */}
        <View style={c.amountDisplay}>
          <Text style={[c.amountSym, { color: PRIMARY }]}>{sym}</Text>
          <Text style={[c.amountVal, { color: colors.text }]}>{amount}</Text>
        </View>

        {/* Numpad */}
        <View style={c.numpad}>
          {NUMPAD.map(key => (
            <TouchableOpacity
              key={key}
              style={[c.numKey, { backgroundColor: colors.card }]}
              onPress={() => handleNumpad(key)}
              activeOpacity={0.55}
            >
              {key === "⌫"
                ? <Ionicons name="backspace" size={22} color={colors.text} />
                : <Text style={[c.numKeyText, { color: colors.text }]}>{key}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <View style={[c.descWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[c.descInput, { color: colors.text }]}
            placeholder="What's this for? (optional)"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={[c.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[c.primaryBtn, !step1Valid && { opacity: 0.4 }]}
            onPress={() => setStep(2)}
            disabled={!step1Valid}
          >
            <Text style={c.primaryBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step 2: Options ────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <View style={[c.container, { backgroundColor: colors.background }]}>
        <View style={[c.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setStep(1)} style={c.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[c.headerTitle, { color: colors.text }]}>Options</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={c.stepDots}>
          <View style={[c.dot, { backgroundColor: colors.border }]} />
          <View style={[c.dot, c.dotActive]} />
          <View style={[c.dot, { backgroundColor: colors.border }]} />
        </View>

        {/* Amount summary pill */}
        <View style={[c.amountSummary, { backgroundColor: colors.primaryLight }]}>
          <Text style={[c.amountSummaryLabel, { color: colors.textSecondary }]}>Requesting</Text>
          <Text style={[c.amountSummaryVal, { color: PRIMARY }]}>{sym}{parseFloat(amount).toFixed(2)} {currency}</Text>
          {description ? <Text style={[c.amountSummaryDesc, { color: colors.textMuted }]}>{description}</Text> : null}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={c.optionsContent} showsVerticalScrollIndicator={false}>

          {/* ── Sender / Type ── */}
          <SectionCard
            title="Your Name"
            subtitle={senderName || "Set your display name"}
            icon="person"
            expanded={showTypeSection}
            onToggle={() => setShowTypeSection(v => !v)}
            colors={colors}
          >
            <View style={c.typeToggle}>
              {(["personal", "business"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[c.typeBtn, { borderColor: colors.border, backgroundColor: colors.surface },
                    type === t && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
                  onPress={() => setType(t)}
                >
                  <Ionicons name={t === "personal" ? "person" : "business"} size={16} color={type === t ? "#fff" : colors.textMuted} />
                  <Text style={[c.typeBtnText, { color: type === t ? "#fff" : colors.textSecondary }]}>
                    {t === "personal" ? "Personal" : "Business"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[c.optLabel, { color: colors.textSecondary }]}>
              {type === "personal" ? "Your full name" : "Business name"}
            </Text>
            <TextInput
              style={[c.optInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={senderName}
              onChangeText={setSenderName}
              placeholder={type === "personal" ? "Your name" : "Business name"}
              placeholderTextColor={colors.textMuted}
            />
            {type === "business" && (
              <>
                <Text style={[c.optLabel, { color: colors.textSecondary, marginTop: 12 }]}>Business Logo (optional)</Text>
                <TouchableOpacity style={[c.logoPicker, { borderColor: colors.border }]} onPress={pickLogo}>
                  {businessLogo
                    ? <Image source={{ uri: businessLogo }} style={c.logoImg} />
                    : <View style={c.logoEmpty}>
                        <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
                        <Text style={[c.logoEmptyText, { color: colors.textMuted }]}>Add logo</Text>
                      </View>}
                </TouchableOpacity>
                {businessLogo && (
                  <TouchableOpacity onPress={() => setBusinessLogo(null)} style={c.removeLogo}>
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={[c.removeLogoText, { color: colors.error }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </SectionCard>

          {/* ── Partial Payment ── */}
          <View style={[c.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={c.sectionRow}>
              <View style={[c.sectionIconWrap, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
                <Ionicons name="layers-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.sectionTitle, { color: colors.text }]}>Allow Partial Payment</Text>
                <Text style={[c.sectionSub, { color: colors.textMuted }]}>Let payers pay in installments</Text>
              </View>
              <Switch
                value={allowPartial}
                onValueChange={setAllowPartial}
                trackColor={{ true: PRIMARY }}
                thumbColor="#fff"
              />
            </View>
            {allowPartial && (
              <View style={c.sectionExpanded}>
                <Text style={[c.optLabel, { color: colors.textSecondary }]}>Minimum payment ({currency})</Text>
                <TextInput
                  style={[c.optInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={minimumPayment}
                  onChangeText={setMinimumPayment}
                  placeholder={`e.g. ${(parseFloat(amount || "0") * 0.5).toFixed(2)} (leave blank for any amount)`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            )}
          </View>

          {/* ── Destination ── */}
          <SectionCard
            title="Payment Destination"
            subtitle={destination === "wallet" ? "BukkaPay Wallet" : `Bank — ${accountHolder || "enter details"}`}
            icon="wallet-outline"
            expanded={showDestSection}
            onToggle={() => setShowDestSection(v => !v)}
            colors={colors}
          >
            <View style={c.typeToggle}>
              {(["wallet", "bank"] as const).map(d => (
                <TouchableOpacity
                  key={d}
                  style={[c.typeBtn, { borderColor: colors.border, backgroundColor: colors.surface },
                    destination === d && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
                  onPress={() => setDestination(d)}
                >
                  <Ionicons name={d === "wallet" ? "wallet" : "business"} size={16} color={destination === d ? "#fff" : colors.textMuted} />
                  <Text style={[c.typeBtnText, { color: destination === d ? "#fff" : colors.textSecondary }]}>
                    {d === "wallet" ? "Wallet" : "Bank"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {destination === "bank" && (
              <View style={{ gap: 10, marginTop: 12 }}>
                {[
                  { label: "Account Holder *", val: accountHolder, set: setAccountHolder, placeholder: "Full name" },
                  { label: "Bank Name *", val: bankName, set: setBankName, placeholder: "e.g. First National Bank" },
                  { label: "Account Number *", val: accountNumber, set: setAccountNumber, placeholder: "e.g. 62123456789", keyboard: "numeric" },
                  { label: "Branch Code", val: branchCode, set: setBranchCode, placeholder: "Optional", keyboard: "numeric" },
                  { label: "Country", val: bankCountry, set: setBankCountry, placeholder: "e.g. South Africa" },
                ].map(f => (
                  <View key={f.label}>
                    <Text style={[c.optLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                    <TextInput
                      style={[c.optInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                      value={f.val} onChangeText={f.set} placeholder={f.placeholder}
                      placeholderTextColor={colors.textMuted}
                      keyboardType={(f.keyboard as any) || "default"}
                    />
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* ── Region ── */}
          <SectionCard
            title="Region"
            subtitle={region === "local" ? "Local" : region === "africa" ? `Africa${subRegion ? ` — ${subRegion}` : ""}` : `International${subRegion ? ` — ${subRegion}` : ""}`}
            icon="earth-outline"
            expanded={showRegionSection}
            onToggle={() => setShowRegionSection(v => !v)}
            colors={colors}
          >
            <View style={c.chipRow}>
              {(["local", "africa", "international"] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[c.chip, { borderColor: colors.border, backgroundColor: colors.surface },
                    region === r && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
                  onPress={() => { setRegion(r); setSubRegion(""); }}
                >
                  <Text style={[c.chipText, { color: region === r ? "#fff" : colors.textSecondary }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(region === "africa" || region === "international") && (
              <View style={{ marginTop: 12 }}>
                <Text style={[c.optLabel, { color: colors.textSecondary }]}>Sub-region</Text>
                <View style={c.chipRow}>
                  {(region === "africa" ? africaSubRegions : intlSubRegions).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[c.chip, { borderColor: colors.border, backgroundColor: colors.surface },
                        subRegion === r && { backgroundColor: PRIMARY, borderColor: PRIMARY }]}
                      onPress={() => setSubRegion(r)}
                    >
                      <Text style={[c.chipText, { color: subRegion === r ? "#fff" : colors.textSecondary }]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </SectionCard>

          {/* ── Invoice ── */}
          <View style={[c.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={c.sectionRow}>
              <View style={[c.sectionIconWrap, { backgroundColor: "rgba(59,130,246,0.12)" }]}>
                <Ionicons name="document-text-outline" size={18} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.sectionTitle, { color: colors.text }]}>Attach Invoice</Text>
                <Text style={[c.sectionSub, { color: colors.textMuted }]}>Add itemised invoice or quotation</Text>
              </View>
              <Switch
                value={hasInvoice}
                onValueChange={setHasInvoice}
                trackColor={{ true: PRIMARY }}
                thumbColor="#fff"
              />
            </View>
            {hasInvoice && (
              <View style={c.sectionExpanded}>
                {[
                  { label: "Customer Name *", val: customerName, set: setCustomerName, placeholder: "John Doe" },
                  { label: "Customer Email", val: customerEmail, set: setCustomerEmail, placeholder: "john@email.com", keyboard: "email-address" },
                  { label: "Customer Phone", val: customerPhone, set: setCustomerPhone, placeholder: "+27...", keyboard: "phone-pad" },
                  { label: "Due Date", val: dueDate, set: setDueDate, placeholder: "YYYY-MM-DD" },
                ].map(f => (
                  <View key={f.label} style={{ marginBottom: 10 }}>
                    <Text style={[c.optLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                    <TextInput
                      style={[c.optInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                      value={f.val} onChangeText={f.set} placeholder={f.placeholder}
                      placeholderTextColor={colors.textMuted}
                      keyboardType={(f.keyboard as any) || "default"}
                      autoCapitalize="none"
                    />
                  </View>
                ))}

                <Text style={[c.optLabel, { color: colors.textSecondary, marginTop: 4 }]}>Line Items</Text>
                {items.map((item, i) => (
                  <View key={i} style={c.itemRow}>
                    <TextInput
                      style={[c.optInput, { flex: 2, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginRight: 6 }]}
                      value={item.name} onChangeText={v => updateItem(i, "name", v)} placeholder="Item"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                      style={[c.optInput, { flex: 0.7, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginRight: 6 }]}
                      value={item.quantity} onChangeText={v => updateItem(i, "quantity", v)}
                      placeholder="Qty" placeholderTextColor={colors.textMuted} keyboardType="numeric"
                    />
                    <TextInput
                      style={[c.optInput, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                      value={item.unitPrice} onChangeText={v => updateItem(i, "unitPrice", v)}
                      placeholder="Price" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
                    />
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(i)} style={{ padding: 8 }}>
                        <Ionicons name="close-circle" size={20} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={addItem} style={c.addItemBtn}>
                  <Ionicons name="add-circle-outline" size={18} color={PRIMARY} />
                  <Text style={[c.addItemText, { color: PRIMARY }]}>Add item</Text>
                </TouchableOpacity>
                {totalInvoice > 0 && (
                  <View style={[c.invoiceTotal, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[c.invoiceTotalLabel, { color: colors.textSecondary }]}>Invoice Total</Text>
                    <Text style={[c.invoiceTotalVal, { color: PRIMARY }]}>{currency} {totalInvoice.toFixed(2)}</Text>
                  </View>
                )}
                <Text style={[c.optLabel, { color: colors.textSecondary, marginTop: 12 }]}>Notes</Text>
                <TextInput
                  style={[c.optInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, minHeight: 64, textAlignVertical: "top" }]}
                  value={invoiceNotes} onChangeText={setInvoiceNotes}
                  placeholder="Additional notes..." placeholderTextColor={colors.textMuted} multiline
                />
                <Text style={[c.optLabel, { color: colors.textSecondary, marginTop: 12 }]}>Attachment (PDF/image, max 4 MB)</Text>
                {attachmentData ? (
                  <View style={[c.attachedFile, { backgroundColor: colors.primaryLight, borderColor: PRIMARY + "40" }]}>
                    <Ionicons name="document-attach" size={22} color={PRIMARY} />
                    <Text style={[c.attachedFileName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{attachmentName}</Text>
                    <TouchableOpacity onPress={() => { setAttachmentName(""); setAttachmentData(null); setAttachmentSize(0); }}>
                      <Ionicons name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[c.attachBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={pickAttachment}>
                    <Ionicons name="cloud-upload-outline" size={20} color={PRIMARY} />
                    <Text style={[c.attachBtnText, { color: PRIMARY }]}>Choose File</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={[c.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {createError && (
            <View style={[c.errorBanner, { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "#EF4444" }]}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={c.errorText}>{createError}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[c.primaryBtn, (!step2Valid || isLoading) && { opacity: 0.4 }]}
            onPress={handleCreate}
            disabled={!step2Valid || isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="link" size={18} color="#fff" />
                  <Text style={c.primaryBtnText}>Create Payment Link</Text>
                </>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step 3: Success ────────────────────────────────────────────────────────
  return (
    <View style={[c.container, { backgroundColor: colors.background }]}>
      <View style={[c.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={{ width: 40 }} />
        <Text style={[c.headerTitle, { color: colors.text }]}>Link Ready!</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={c.stepDots}>
        <View style={[c.dot, { backgroundColor: colors.border }]} />
        <View style={[c.dot, { backgroundColor: colors.border }]} />
        <View style={[c.dot, c.dotActive]} />
      </View>

      <ScrollView contentContainerStyle={c.successContent} showsVerticalScrollIndicator={false}>
        {/* Celebration header */}
        <View style={[c.successHero, { backgroundColor: PRIMARY }]}>
          <View style={c.successCheck}>
            <Ionicons name="checkmark-circle" size={52} color="#fff" />
          </View>
          <Text style={c.successHeroAmount}>{sym}{parseFloat(createdLink?.amount || "0").toFixed(2)}</Text>
          <Text style={c.successHeroCur}>{currency}</Text>
          {description ? <Text style={c.successHeroDesc}>{description}</Text> : null}
        </View>

        {/* Link box */}
        <View style={[c.linkBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={c.linkBoxHeader}>
            <Ionicons name="link" size={16} color={PRIMARY} />
            <Text style={[c.linkBoxLabel, { color: PRIMARY }]}>YOUR PAYMENT LINK</Text>
          </View>
          <Text style={[c.linkText, { color: colors.text }]} selectable numberOfLines={2}>
            {createdLink?.shareUrl}
          </Text>
          <TouchableOpacity
            style={[c.copyBtn, { borderColor: copied ? GREEN : PRIMARY, backgroundColor: copied ? "rgba(16,185,129,0.1)" : colors.primaryLight }]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={copied ? GREEN : PRIMARY} />
            <Text style={[c.copyBtnText, { color: copied ? GREEN : PRIMARY }]}>
              {copied ? "Copied!" : "Copy Link"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Share buttons */}
        <Text style={[c.shareLabel, { color: colors.textSecondary }]}>Share via</Text>

        <View style={c.shareGrid}>
          <TouchableOpacity style={[c.shareBtn, { backgroundColor: "#25D366" }]} onPress={shareWhatsApp} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={22} color="#fff" />
            <Text style={c.shareBtnText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[c.shareBtn, { backgroundColor: "#2563EB" }]} onPress={shareEmail} activeOpacity={0.85}>
            <Ionicons name="mail" size={22} color="#fff" />
            <Text style={c.shareBtnText}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[c.shareBtn, { backgroundColor: PRIMARY }]} onPress={shareSMS} activeOpacity={0.85}>
            <Ionicons name="chatbubble" size={22} color="#fff" />
            <Text style={c.shareBtnText}>SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[c.shareBtn, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border }]} onPress={shareNative} activeOpacity={0.85}>
            <Ionicons name="share-social" size={22} color={PRIMARY} />
            <Text style={[c.shareBtnText, { color: PRIMARY }]}>More</Text>
          </TouchableOpacity>
        </View>

        {/* Details */}
        <View style={[c.detailsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <DetailRow label="Amount" value={`${currency} ${parseFloat(createdLink?.amount || "0").toFixed(2)}`} colors={colors} />
          <DetailRow label="Status" value="Active — awaiting payment" valueColor={GREEN} colors={colors} />
          <DetailRow label="Partial Payment" value={allowPartial ? "Allowed" : "No"} colors={colors} />
          {hasInvoice && createdLink?.invoice && (
            <DetailRow label="Invoice for" value={customerName} colors={colors} />
          )}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[c.viewLinksBtn, { borderColor: PRIMARY, backgroundColor: colors.primaryLight }]}
          onPress={() => router.push("/(screens)/payment-links" as any)}
        >
          <Ionicons name="list" size={18} color={PRIMARY} />
          <Text style={[c.viewLinksBtnText, { color: PRIMARY }]}>View My Payment Links</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[c.newLinkBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => {
            setStep(1); setAmount("0"); setDescription(""); setCurrency("ZAR");
            setCreatedLink(null); setHasInvoice(false); setAllowPartial(false);
            setDestination("wallet"); setRegion("local");
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
          <Text style={[c.newLinkBtnText, { color: colors.textSecondary }]}>Create Another Link</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Section Card helper ────────────────────────────────────────────────────────
function SectionCard({
  title, subtitle, icon, expanded, onToggle, colors, children,
}: {
  title: string; subtitle: string; icon: string;
  expanded: boolean; onToggle: () => void;
  colors: any; children: React.ReactNode;
}) {
  return (
    <View style={[c.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity style={c.sectionRow} onPress={onToggle} activeOpacity={0.7}>
        <View style={[c.sectionIconWrap, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={icon as any} size={18} color={PRIMARY} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[c.sectionTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[c.sectionSub, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {expanded && <View style={c.sectionExpanded}>{children}</View>}
    </View>
  );
}

function DetailRow({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: any;
}) {
  return (
    <View style={c.detailRow}>
      <Text style={[c.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[c.detailValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );
}

const c = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 52 : 40, paddingBottom: 12, paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700" },

  stepDots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5E7EB" },
  dotActive: { backgroundColor: PRIMARY, width: 24 },

  currencyScroll: { height: 46 },
  currencyScrollInner: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  currencyChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
  },
  currencyChipText: { fontSize: 13, fontWeight: "700" },

  amountDisplay: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "center",
    paddingVertical: 20,
  },
  amountSym: { fontSize: 30, fontWeight: "700", marginRight: 4 },
  amountVal: { fontSize: 58, fontWeight: "900", letterSpacing: -2 },

  numpad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  numKey: {
    width: "30%", height: 58, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  numKeyText: { fontSize: 22, fontWeight: "600" },

  descWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5,
  },
  descInput: { flex: 1, fontSize: 15 },

  footer: { padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 20, borderTopWidth: 1, gap: 10 },
  primaryBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  primaryBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  errorText: { flex: 1, fontSize: 13, color: "#EF4444", fontWeight: "600" },

  amountSummary: {
    marginHorizontal: 16, marginBottom: 8, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12,
  },
  amountSummaryLabel: { fontSize: 12, fontWeight: "600" },
  amountSummaryVal: { fontSize: 18, fontWeight: "800", marginLeft: 4 },
  amountSummaryDesc: { fontSize: 12, marginLeft: "auto" },

  optionsContent: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  sectionCard: { borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  sectionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  sectionSub: { fontSize: 12, marginTop: 2 },
  sectionExpanded: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 14 },

  typeToggle: { flexDirection: "row", gap: 10, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  typeBtnText: { fontSize: 14, fontWeight: "700" },

  logoPicker: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderStyle: "dashed",
    alignSelf: "center", overflow: "hidden", marginTop: 8,
  },
  logoImg: { width: "100%", height: "100%", borderRadius: 40 },
  logoEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  logoEmptyText: { fontSize: 10 },
  removeLogo: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center", marginTop: 6 },
  removeLogoText: { fontSize: 12 },

  optLabel: { fontSize: 12, fontWeight: "600", marginBottom: 5 },
  optInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: "600" },

  itemRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  addItemBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  addItemText: { fontSize: 13, fontWeight: "700" },
  invoiceTotal: { flexDirection: "row", justifyContent: "space-between", borderRadius: 10, padding: 12, marginTop: 8 },
  invoiceTotalLabel: { fontSize: 13, fontWeight: "600" },
  invoiceTotalVal: { fontSize: 13, fontWeight: "800" },
  attachBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 14, marginTop: 4 },
  attachBtnText: { fontSize: 14, fontWeight: "700" },
  attachedFile: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4 },
  attachedFileName: { fontSize: 13, fontWeight: "600" },

  successContent: { paddingBottom: 40 },
  successHero: { padding: 32, alignItems: "center", borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  successCheck: { marginBottom: 12 },
  successHeroAmount: { fontSize: 44, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  successHeroCur: { fontSize: 16, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  successHeroDesc: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 8 },

  linkBox: { margin: 16, borderRadius: 16, padding: 16, borderWidth: 1.5 },
  linkBoxHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  linkBoxLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  linkText: { fontSize: 13, fontWeight: "600", lineHeight: 20, marginBottom: 12 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  copyBtnText: { fontSize: 15, fontWeight: "700" },

  shareLabel: { fontSize: 14, fontWeight: "700", marginHorizontal: 16, marginBottom: 10 },
  shareGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  shareBtn: {
    flex: 1, minWidth: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  shareBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  detailsCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600" },

  viewLinksBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10,
  },
  viewLinksBtnText: { fontSize: 15, fontWeight: "700" },
  newLinkBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
  newLinkBtnText: { fontSize: 15, fontWeight: "600" },
});
