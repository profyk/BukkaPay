import { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  Platform, Alert, ActivityIndicator, Share, Linking, Modal, FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useTheme } from "../lib/ThemeContext";
import { useToast } from "../hooks/use-toast";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

const BILL_TYPES = [
  { id: "water", label: "Water & Sanitation", icon: "water" as const, color: "#3B82F6" },
  { id: "electricity", label: "Electricity", icon: "flash" as const, color: "#F59E0B" },
  { id: "rates", label: "Rates & Taxes", icon: "business" as const, color: "#8B5CF6" },
  { id: "municipal", label: "Municipal Services", icon: "home" as const, color: "#10B981" },
  { id: "school_fees", label: "School Fees", icon: "school" as const, color: "#EF4444" },
  { id: "internet", label: "Internet / Broadband", icon: "wifi" as const, color: "#06B6D4" },
  { id: "gas", label: "Gas / Fuel", icon: "flame" as const, color: "#F97316" },
  { id: "insurance", label: "Insurance", icon: "shield-checkmark" as const, color: "#6366F1" },
  { id: "levy", label: "Body Corporate Levy", icon: "people" as const, color: "#EC4899" },
  { id: "other", label: "Other", icon: "receipt" as const, color: "#6B7280" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "#10B981",
  paid: "#3B82F6",
  overdue: "#EF4444",
  cancelled: "#6B7280",
};

function billTypeInfo(id: string) {
  return BILL_TYPES.find(b => b.id === id) || BILL_TYPES[BILL_TYPES.length - 1];
}

interface BillingLink {
  id: string;
  merchant_id: string;
  payment_link_id?: string;
  biller_name: string;
  bill_type: string;
  description?: string;
  amount: string;
  currency: string;
  account_number?: string;
  billing_period?: string;
  due_date?: string;
  attachments: any[];
  recipients: any[];
  status: string;
  total_collected: string;
  payment_count: number;
  created_at: string;
  payUrl?: string;
}

interface Recipient {
  name: string;
  email: string;
  phone: string;
}

interface Attachment {
  url: string;
  name: string;
  mimeType: string;
}

export default function BillingLinksScreen() {
  const router = useRouter();
  const { colors, darkMode } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedLink, setSelectedLink] = useState<BillingLink | null>(null);

  // Form state
  const [billerName, setBillerName] = useState("");
  const [billType, setBillType] = useState("water");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [accountNumber, setAccountNumber] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([{ name: "", email: "", phone: "" }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [createStep, setCreateStep] = useState<"details" | "recipients" | "attachments" | "review">("details");

  const bg = darkMode ? "#0F0F1A" : "#F8FAFC";
  const card = darkMode ? "#1A1A2E" : "#FFFFFF";
  const border = darkMode ? "#2D2D44" : "#E5E7EB";
  const text = colors.text;
  const sub = darkMode ? "#9CA3AF" : "#6B7280";

  const { data: merchants = [] } = useQuery<any[]>({
    queryKey: ["/api/merchants"],
  });

  const primaryMerchant = Array.isArray(merchants) && merchants.length > 0 ? merchants[0] : null;
  const merchantPlan = primaryMerchant?.subscriptionPlan || primaryMerchant?.subscription_plan || "starter";
  const canUseBilling = merchantPlan === "business";

  const { data: billingLinks = [], isLoading } = useQuery<BillingLink[]>({
    queryKey: ["/api/billing-links"],
    enabled: !!primaryMerchant,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/billing-links", data),
    onSuccess: (link: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-links"] });
      toast({ title: "Billing link created!", description: "Ready to send to recipients." });
      resetForm();
      setShowCreate(false);
      if (link) setSelectedLink(link);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/billing-links/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-links"] });
      setSelectedLink(null);
      toast({ title: "Deleted", description: "Billing link removed." });
    },
  });

  const resetForm = () => {
    setBillerName(""); setBillType("water"); setDescription(""); setAmount("");
    setCurrency("ZAR"); setAccountNumber(""); setBillingPeriod(""); setDueDate("");
    setRecipients([{ name: "", email: "", phone: "" }]); setAttachments([]);
    setCreateStep("details");
  };

  const pickDocument = async () => {
    setUploadingDoc(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || "application/pdf";
      const uploaded = await apiRequest("POST", "/api/upload", {
        base64, mimeType: mime, filename: asset.name || "document.pdf",
      }) as any;
      setAttachments(prev => [...prev, { url: uploaded.url, name: asset.name || "document.pdf", mimeType: mime }]);
      toast({ title: "Attached", description: `${asset.name} added.` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message });
    } finally {
      setUploadingDoc(false);
    }
  };

  const shareLink = async (link: BillingLink) => {
    const payUrl = link.payUrl || (link.payment_link_id ? `https://app.bukkapay.com/pay/${link.payment_link_id}` : null);
    if (!payUrl) { toast({ title: "No link yet", description: "Payment link not generated." }); return; }
    const bt = billTypeInfo(link.bill_type);
    const msg = `*${link.biller_name}*\n${bt.label} — ${link.billing_period || ""}\nAmount: ${link.currency} ${parseFloat(link.amount).toFixed(2)}\n${link.account_number ? `Ref: ${link.account_number}\n` : ""}\nPay securely: ${payUrl}`;
    await Share.share({ message: msg });
  };

  const sendViaWhatsApp = (link: BillingLink, recipient: Recipient) => {
    const payUrl = link.payUrl || (link.payment_link_id ? `https://app.bukkapay.com/pay/${link.payment_link_id}` : "");
    const bt = billTypeInfo(link.bill_type);
    const msg = `Hi ${recipient.name || ""},\n\n*${link.biller_name}* — ${bt.label}\nPeriod: ${link.billing_period || "—"}\nAmount: ${link.currency} ${parseFloat(link.amount).toFixed(2)}\n${link.account_number ? `Account Ref: ${link.account_number}\n` : ""}${link.due_date ? `Due: ${new Date(link.due_date).toLocaleDateString()}\n` : ""}\nPay here: ${payUrl}\n\nPowered by BukkaPay`;
    const phone = recipient.phone?.replace(/[^0-9]/g, "");
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
    });
  };

  const handleCreate = () => {
    if (!primaryMerchant) {
      toast({ title: "No merchant account", description: "Please create a merchant account first." });
      return;
    }
    if (!billerName.trim() || !amount.trim()) {
      toast({ title: "Required fields", description: "Biller name and amount are required." });
      return;
    }
    createMutation.mutate({
      merchantId: primaryMerchant.id,
      billerName: billerName.trim(),
      billType, description: description.trim() || undefined,
      amount: parseFloat(amount), currency,
      accountNumber: accountNumber.trim() || undefined,
      billingPeriod: billingPeriod.trim() || undefined,
      dueDate: dueDate.trim() || undefined,
      recipients: recipients.filter(r => r.name || r.email || r.phone),
      attachments,
    });
  };

  // ── Upgrade required screen ──
  if (primaryMerchant && !canUseBilling) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: text }]}>Billing Pay Links</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: "center" }}>
          <View style={{ height: 60 }} />
          <View style={[{ backgroundColor: "#F59E0B20", borderRadius: 40, padding: 20, marginBottom: 20 }]}>
            <Ionicons name="receipt" size={48} color="#F59E0B" />
          </View>
          <Text style={[s.stepTitle, { color: text, textAlign: "center" }]}>Business Plan Required</Text>
          <Text style={[s.stepSub, { color: sub, textAlign: "center", marginBottom: 24 }]}>
            Billing Pay Links — send utilities, municipal bills and invoices via email &amp; WhatsApp — are a Business plan feature.
          </Text>
          <View style={[s.planCard, { backgroundColor: card, borderColor: "#F59E0B", borderWidth: 2, width: "100%", marginBottom: 20 }]}>
            <Text style={[s.planName, { color: text, marginBottom: 4 }]}>Business Plan</Text>
            <Text style={[s.planPrice, { color: "#F59E0B" }]}>R299/month</Text>
            <View style={[s.planDivider, { backgroundColor: border, marginVertical: 12 }]} />
            {[
              "Unlimited Billing Pay Links",
              "Bulk send via Email & WhatsApp",
              "PDF / document attachments",
              "Custom branding",
              "Advanced analytics",
            ].map(f => (
              <View key={f} style={s.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[s.featureText, { color: text }]}>{f}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: "#F59E0B", width: "100%" }]}
            onPress={() => router.push("/(screens)/become-merchant" as any)}
          >
            <Text style={s.primaryBtnText}>Upgrade to Business</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: text }]}>Billing Pay Links</Text>
        <TouchableOpacity onPress={() => { resetForm(); setShowCreate(true); }}>
          <Ionicons name="add-circle" size={26} color="#7C3AED" />
        </TouchableOpacity>
      </View>

      {/* No merchant */}
      {!primaryMerchant && !isLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="storefront-outline" size={56} color={sub} />
          <Text style={[s.stepTitle, { color: text, textAlign: "center", marginTop: 16 }]}>No Merchant Account</Text>
          <Text style={[s.stepSub, { color: sub, textAlign: "center" }]}>Create a merchant account to start sending billing links.</Text>
          <TouchableOpacity style={[s.primaryBtn, { marginTop: 24, paddingHorizontal: 32 }]} onPress={() => router.push("/(screens)/become-merchant" as any)}>
            <Text style={s.primaryBtnText}>Become a Merchant</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Billing links list */}
      {primaryMerchant && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Summary row */}
          <View style={[s.summaryRow, { backgroundColor: card, borderColor: border }]}>
            {[
              { label: "Total Bills", value: billingLinks.length, icon: "receipt", color: "#7C3AED" },
              { label: "Active", value: billingLinks.filter(b => b.status === "active").length, icon: "radio-button-on", color: "#10B981" },
              { label: "Paid", value: billingLinks.filter(b => b.status === "paid").length, icon: "checkmark-circle", color: "#3B82F6" },
            ].map((s2) => (
              <View key={s2.label} style={s.summaryItem}>
                <Ionicons name={s2.icon as any} size={20} color={s2.color} />
                <Text style={[s.summaryNum, { color: text }]}>{s2.value}</Text>
                <Text style={[s.summaryLabel, { color: sub }]}>{s2.label}</Text>
              </View>
            ))}
          </View>

          {isLoading && <ActivityIndicator color="#7C3AED" style={{ marginTop: 40 }} />}

          {!isLoading && billingLinks.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 60, gap: 12 }}>
              <Ionicons name="receipt-outline" size={60} color={sub} />
              <Text style={[s.stepTitle, { color: text, textAlign: "center" }]}>No billing links yet</Text>
              <Text style={[s.stepSub, { color: sub, textAlign: "center" }]}>Create your first billing link to send water, electricity or other bills digitally.</Text>
              <TouchableOpacity style={[s.primaryBtn, { paddingHorizontal: 32, marginTop: 8 }]} onPress={() => { resetForm(); setShowCreate(true); }}>
                <Text style={s.primaryBtnText}>Create Billing Link</Text>
              </TouchableOpacity>
            </View>
          )}

          {billingLinks.map((link) => {
            const bt = billTypeInfo(link.bill_type);
            const collected = parseFloat(link.total_collected || "0");
            const total = parseFloat(link.amount || "0");
            const progress = total > 0 ? Math.min(collected / total, 1) : 0;
            return (
              <TouchableOpacity
                key={link.id}
                style={[s.linkCard, { backgroundColor: card, borderColor: border }]}
                onPress={() => setSelectedLink(link)}
              >
                <View style={s.linkCardHeader}>
                  <View style={[s.linkTypeIcon, { backgroundColor: bt.color + "20" }]}>
                    <Ionicons name={bt.icon} size={20} color={bt.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.linkBillerName, { color: text }]}>{link.biller_name}</Text>
                    <Text style={[s.linkType, { color: sub }]}>{bt.label}{link.billing_period ? ` · ${link.billing_period}` : ""}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: (STATUS_COLORS[link.status] || "#6B7280") + "20" }]}>
                    <Text style={[s.statusText, { color: STATUS_COLORS[link.status] || "#6B7280" }]}>{link.status}</Text>
                  </View>
                </View>

                <View style={s.linkAmountRow}>
                  <Text style={[s.linkAmount, { color: text }]}>{link.currency} {parseFloat(link.amount).toFixed(2)}</Text>
                  <Text style={[s.linkSub, { color: sub }]}>{link.payment_count} payment{link.payment_count !== 1 ? "s" : ""} · {link.recipients?.length || 0} recipient{(link.recipients?.length || 0) !== 1 ? "s" : ""}</Text>
                </View>

                {collected > 0 && (
                  <View>
                    <View style={[s.progressBg, { backgroundColor: border, marginTop: 10 }]}>
                      <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: bt.color }]} />
                    </View>
                    <Text style={[s.linkSub, { color: sub, marginTop: 3 }]}>Collected: {link.currency} {collected.toFixed(2)}</Text>
                  </View>
                )}

                <View style={[s.linkActions, { borderTopColor: border }]}>
                  <TouchableOpacity style={s.linkAction} onPress={() => shareLink(link)}>
                    <Ionicons name="share-outline" size={16} color="#7C3AED" />
                    <Text style={[s.linkActionText, { color: "#7C3AED" }]}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.linkAction} onPress={() => setSelectedLink(link)}>
                    <Ionicons name="eye-outline" size={16} color={sub} />
                    <Text style={[s.linkActionText, { color: sub }]}>View</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* FAB */}
      {primaryMerchant && (
        <TouchableOpacity style={s.fab} onPress={() => { resetForm(); setShowCreate(true); }}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── CREATE MODAL ── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: bg }}>
          <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
            <TouchableOpacity onPress={() => {
              const prev: Record<string, string | null> = { details: null, recipients: "details", attachments: "recipients", review: "attachments" };
              const p = prev[createStep];
              if (p) setCreateStep(p as any);
              else setShowCreate(false);
            }}>
              <Ionicons name="close" size={24} color={text} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: text }]}>New Billing Link</Text>
            <Text style={[{ color: sub, fontSize: 12 }]}>
              {createStep === "details" ? "1/4" : createStep === "recipients" ? "2/4" : createStep === "attachments" ? "3/4" : "4/4"}
            </Text>
          </View>

          <View style={[s.progressBg, { backgroundColor: border }]}>
            <View style={[s.progressFill, {
              width: createStep === "details" ? "25%" : createStep === "recipients" ? "50%" : createStep === "attachments" ? "75%" : "100%",
              backgroundColor: "#7C3AED",
            }]} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Step 1: Details */}
            {createStep === "details" && (
              <View>
                <Text style={[s.stepTitle, { color: text }]}>Bill Details</Text>

                <Text style={[s.fieldLabel, { color: text }]}>Bill Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {BILL_TYPES.map((bt) => (
                      <TouchableOpacity
                        key={bt.id}
                        style={[s.billTypeChip, {
                          backgroundColor: billType === bt.id ? bt.color : card,
                          borderColor: billType === bt.id ? bt.color : border,
                        }]}
                        onPress={() => setBillType(bt.id)}
                      >
                        <Ionicons name={bt.icon} size={14} color={billType === bt.id ? "#fff" : sub} />
                        <Text style={[s.billTypeChipText, { color: billType === bt.id ? "#fff" : sub }]}>{bt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={[s.fieldLabel, { color: text }]}>Biller / Organisation Name *</Text>
                <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
                  placeholder="e.g. City of Cape Town" placeholderTextColor={sub}
                  value={billerName} onChangeText={setBillerName} />

                <Text style={[s.fieldLabel, { color: text }]}>Amount *</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={[s.currencyBtn, { backgroundColor: card, borderColor: border }]}
                    onPress={() => setCurrency(currency === "ZAR" ? "USD" : currency === "USD" ? "GBP" : currency === "GBP" ? "NGN" : "ZAR")}>
                    <Text style={[{ color: text, fontWeight: "700" }]}>{currency}</Text>
                  </TouchableOpacity>
                  <TextInput style={[s.input, { flex: 1, color: text, backgroundColor: card, borderColor: border }]}
                    placeholder="0.00" placeholderTextColor={sub}
                    keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
                </View>

                <Text style={[s.fieldLabel, { color: text }]}>Account / Reference Number</Text>
                <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
                  placeholder="e.g. 000123456" placeholderTextColor={sub}
                  value={accountNumber} onChangeText={setAccountNumber} />

                <Text style={[s.fieldLabel, { color: text }]}>Billing Period</Text>
                <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
                  placeholder="e.g. March 2026" placeholderTextColor={sub}
                  value={billingPeriod} onChangeText={setBillingPeriod} />

                <Text style={[s.fieldLabel, { color: text }]}>Due Date</Text>
                <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border }]}
                  placeholder="e.g. 2026-04-30" placeholderTextColor={sub}
                  value={dueDate} onChangeText={setDueDate} />

                <Text style={[s.fieldLabel, { color: text }]}>Notes / Description</Text>
                <TextInput style={[s.input, { color: text, backgroundColor: card, borderColor: border, height: 80, textAlignVertical: "top" }]}
                  placeholder="Additional details..." placeholderTextColor={sub} multiline
                  value={description} onChangeText={setDescription} />

                <TouchableOpacity
                  style={[s.primaryBtn, { marginTop: 24, opacity: billerName.trim() && amount.trim() ? 1 : 0.45 }]}
                  disabled={!billerName.trim() || !amount.trim()}
                  onPress={() => setCreateStep("recipients")}
                >
                  <Text style={s.primaryBtnText}>Continue: Add Recipients →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Recipients */}
            {createStep === "recipients" && (
              <View>
                <Text style={[s.stepTitle, { color: text }]}>Recipients</Text>
                <Text style={[s.stepSub, { color: sub }]}>Add who should receive this bill. You can add multiple.</Text>

                {recipients.map((r, i) => (
                  <View key={i} style={[s.recipientCard, { backgroundColor: card, borderColor: border }]}>
                    <View style={s.recipientHeader}>
                      <Text style={[s.fieldLabel, { color: text, marginTop: 0 }]}>Recipient {i + 1}</Text>
                      {recipients.length > 1 && (
                        <TouchableOpacity onPress={() => setRecipients(prev => prev.filter((_, j) => j !== i))}>
                          <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput style={[s.input, { color: text, backgroundColor: bg, borderColor: border, marginBottom: 8 }]}
                      placeholder="Name" placeholderTextColor={sub}
                      value={r.name} onChangeText={(v) => setRecipients(prev => prev.map((rr, j) => j === i ? { ...rr, name: v } : rr))} />
                    <TextInput style={[s.input, { color: text, backgroundColor: bg, borderColor: border, marginBottom: 8 }]}
                      placeholder="Email address" placeholderTextColor={sub} keyboardType="email-address" autoCapitalize="none"
                      value={r.email} onChangeText={(v) => setRecipients(prev => prev.map((rr, j) => j === i ? { ...rr, email: v } : rr))} />
                    <TextInput style={[s.input, { color: text, backgroundColor: bg, borderColor: border }]}
                      placeholder="Phone (with country code)" placeholderTextColor={sub} keyboardType="phone-pad"
                      value={r.phone} onChangeText={(v) => setRecipients(prev => prev.map((rr, j) => j === i ? { ...rr, phone: v } : rr))} />
                  </View>
                ))}

                <TouchableOpacity style={[s.addRecipientBtn, { borderColor: border }]}
                  onPress={() => setRecipients(prev => [...prev, { name: "", email: "", phone: "" }])}>
                  <Ionicons name="person-add-outline" size={18} color="#7C3AED" />
                  <Text style={[{ color: "#7C3AED", fontWeight: "600", fontSize: 14 }]}>Add Another Recipient</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.primaryBtn, { marginTop: 20 }]} onPress={() => setCreateStep("attachments")}>
                  <Text style={s.primaryBtnText}>Continue: Attach Documents →</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primaryBtn, { marginTop: 10, backgroundColor: "transparent", borderWidth: 1, borderColor: "#7C3AED" }]} onPress={() => setCreateStep("attachments")}>
                  <Text style={[s.primaryBtnText, { color: "#7C3AED" }]}>Skip — No Attachments</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 3: Attachments */}
            {createStep === "attachments" && (
              <View>
                <Text style={[s.stepTitle, { color: text }]}>Attach Documents</Text>
                <Text style={[s.stepSub, { color: sub }]}>Attach the actual bill or any supporting PDFs / images.</Text>

                {attachments.map((att, i) => (
                  <View key={i} style={[s.attachmentRow, { backgroundColor: card, borderColor: border }]}>
                    <Ionicons name="document-text" size={22} color="#7C3AED" />
                    <Text style={[{ flex: 1, color: text, fontSize: 13 }]} numberOfLines={1}>{att.name}</Text>
                    <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity
                  style={[s.addAttachBtn, { borderColor: "#7C3AED50", backgroundColor: "#7C3AED10" }]}
                  onPress={pickDocument}
                  disabled={uploadingDoc}
                >
                  {uploadingDoc ? <ActivityIndicator color="#7C3AED" size="small" /> : <Ionicons name="cloud-upload-outline" size={28} color="#7C3AED" />}
                  <Text style={[{ color: "#7C3AED", fontWeight: "700", fontSize: 14 }]}>
                    {uploadingDoc ? "Uploading..." : "Upload PDF or Image"}
                  </Text>
                  <Text style={[{ color: sub, fontSize: 11 }]}>Tap to pick from your device</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.primaryBtn, { marginTop: 20 }]} onPress={() => setCreateStep("review")}>
                  <Text style={s.primaryBtnText}>Review & Create →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 4: Review */}
            {createStep === "review" && (
              <View>
                <Text style={[s.stepTitle, { color: text }]}>Review & Create</Text>
                <View style={[s.reviewCard, { backgroundColor: card, borderColor: border }]}>
                  {[
                    { label: "Biller", value: billerName },
                    { label: "Bill Type", value: billTypeInfo(billType).label },
                    { label: "Amount", value: `${currency} ${parseFloat(amount || "0").toFixed(2)}` },
                    { label: "Account Ref.", value: accountNumber || "—" },
                    { label: "Period", value: billingPeriod || "—" },
                    { label: "Due Date", value: dueDate || "—" },
                    { label: "Recipients", value: `${recipients.filter(r => r.name || r.email || r.phone).length} added` },
                    { label: "Attachments", value: `${attachments.length} file(s)` },
                  ].map((row) => (
                    <View key={row.label} style={[s.reviewRow, { borderBottomColor: border }]}>
                      <Text style={[s.reviewLabel, { color: sub }]}>{row.label}</Text>
                      <Text style={[s.reviewValue, { color: text }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.primaryBtn, { marginTop: 20 }]}
                  onPress={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.primaryBtnText}>Create Billing Link</Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── DETAIL MODAL ── */}
      <Modal visible={!!selectedLink} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedLink(null)}>
        {selectedLink && (() => {
          const bt = billTypeInfo(selectedLink.bill_type);
          const payUrl = selectedLink.payUrl || (selectedLink.payment_link_id ? `https://app.bukkapay.com/pay/${selectedLink.payment_link_id}` : null);
          return (
            <View style={{ flex: 1, backgroundColor: bg }}>
              <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
                <TouchableOpacity onPress={() => setSelectedLink(null)}>
                  <Ionicons name="close" size={24} color={text} />
                </TouchableOpacity>
                <Text style={[s.headerTitle, { color: text }]}>Billing Link Detail</Text>
                <TouchableOpacity onPress={() => {
                  Alert.alert("Delete", "Delete this billing link?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(selectedLink.id) },
                  ]);
                }}>
                  <Ionicons name="trash-outline" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
                {/* Bill header card */}
                <View style={[s.detailHero, { backgroundColor: bt.color + "15", borderColor: bt.color + "40" }]}>
                  <View style={[s.detailHeroIcon, { backgroundColor: bt.color + "25" }]}>
                    <Ionicons name={bt.icon} size={32} color={bt.color} />
                  </View>
                  <Text style={[s.detailBillerName, { color: text }]}>{selectedLink.biller_name}</Text>
                  <Text style={[s.detailBillType, { color: sub }]}>{bt.label}{selectedLink.billing_period ? ` · ${selectedLink.billing_period}` : ""}</Text>
                  <Text style={[s.detailAmount, { color: bt.color }]}>{selectedLink.currency} {parseFloat(selectedLink.amount).toFixed(2)}</Text>
                  <View style={[s.statusBadge, { backgroundColor: (STATUS_COLORS[selectedLink.status] || "#6B7280") + "20", alignSelf: "center", marginTop: 8 }]}>
                    <Text style={[s.statusText, { color: STATUS_COLORS[selectedLink.status] || "#6B7280" }]}>{selectedLink.status.toUpperCase()}</Text>
                  </View>
                </View>

                {/* Details */}
                <View style={[s.reviewCard, { backgroundColor: card, borderColor: border, marginTop: 16 }]}>
                  {[
                    { label: "Account Ref", value: selectedLink.account_number || "—" },
                    { label: "Due Date", value: selectedLink.due_date ? new Date(selectedLink.due_date).toLocaleDateString() : "—" },
                    { label: "Collected", value: `${selectedLink.currency} ${parseFloat(selectedLink.total_collected || "0").toFixed(2)}` },
                    { label: "Payments", value: selectedLink.payment_count },
                    { label: "Created", value: new Date(selectedLink.created_at).toLocaleDateString() },
                  ].map((row) => (
                    <View key={row.label} style={[s.reviewRow, { borderBottomColor: border }]}>
                      <Text style={[s.reviewLabel, { color: sub }]}>{row.label}</Text>
                      <Text style={[s.reviewValue, { color: text }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Payment link */}
                {payUrl && (
                  <View style={[s.payLinkBox, { backgroundColor: card, borderColor: border }]}>
                    <Text style={[s.fieldLabel, { color: text, marginTop: 0 }]}>Payment Link</Text>
                    <Text style={[{ color: "#7C3AED", fontSize: 12 }]} numberOfLines={2}>{payUrl}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <TouchableOpacity style={[s.iconBtn, { backgroundColor: "#7C3AED20" }]} onPress={() => shareLink(selectedLink)}>
                        <Ionicons name="share-outline" size={16} color="#7C3AED" />
                        <Text style={[{ color: "#7C3AED", fontSize: 12, fontWeight: "600" }]}>Share</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Recipients */}
                {selectedLink.recipients?.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[s.sectionTitle, { color: text }]}>Recipients ({selectedLink.recipients.length})</Text>
                    {selectedLink.recipients.map((r: Recipient, i: number) => (
                      <View key={i} style={[s.recipientCard, { backgroundColor: card, borderColor: border }]}>
                        <Text style={[{ fontWeight: "700", color: text }]}>{r.name || "—"}</Text>
                        <Text style={[{ color: sub, fontSize: 12 }]}>{r.email}</Text>
                        <Text style={[{ color: sub, fontSize: 12 }]}>{r.phone}</Text>
                        {r.phone && (
                          <TouchableOpacity style={[s.waBtn]} onPress={() => sendViaWhatsApp(selectedLink, r)}>
                            <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                            <Text style={[{ color: "#fff", fontSize: 12, fontWeight: "700" }]}>Send via WhatsApp</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Attachments */}
                {selectedLink.attachments?.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[s.sectionTitle, { color: text }]}>Attachments ({selectedLink.attachments.length})</Text>
                    {selectedLink.attachments.map((att: Attachment, i: number) => (
                      <View key={i} style={[s.attachmentRow, { backgroundColor: card, borderColor: border }]}>
                        <Ionicons name="document-text" size={22} color="#7C3AED" />
                        <Text style={[{ flex: 1, color: text, fontSize: 13 }]} numberOfLines={1}>{att.name}</Text>
                        <Ionicons name="download-outline" size={18} color={sub} />
                      </View>
                    ))}
                  </View>
                )}

                {/* Send all via WhatsApp */}
                {selectedLink.recipients?.some((r: Recipient) => r.phone) && (
                  <TouchableOpacity
                    style={[s.primaryBtn, { marginTop: 24, backgroundColor: "#25D366" }]}
                    onPress={() => {
                      selectedLink.recipients.filter((r: Recipient) => r.phone).forEach((r: Recipient) => sendViaWhatsApp(selectedLink, r));
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={s.primaryBtnText}>  Send to All via WhatsApp</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>
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
  summaryRow: {
    flexDirection: "row", borderRadius: 16, borderWidth: 1, marginBottom: 16,
    padding: 16, justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center", gap: 4 },
  summaryNum: { fontSize: 22, fontWeight: "900" },
  summaryLabel: { fontSize: 11 },
  linkCard: { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  linkCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  linkTypeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  linkBillerName: { fontSize: 15, fontWeight: "700" },
  linkType: { fontSize: 12, marginTop: 1 },
  linkAmountRow: { paddingHorizontal: 14, paddingBottom: 10 },
  linkAmount: { fontSize: 20, fontWeight: "900" },
  linkSub: { fontSize: 11, marginTop: 2 },
  linkActions: { flexDirection: "row", borderTopWidth: 1, padding: 10, gap: 16 },
  linkAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkActionText: { fontSize: 12, fontWeight: "600" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  fab: {
    position: "absolute", bottom: 32, right: 24,
    backgroundColor: "#7C3AED", width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#7C3AED", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  stepTitle: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  stepSub: { fontSize: 13, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "500",
  },
  currencyBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  billTypeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1,
  },
  billTypeChipText: { fontSize: 12, fontWeight: "600" },
  recipientCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  recipientHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  addRecipientBtn: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 4,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderStyle: "dashed",
  },
  attachmentRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  addAttachBtn: {
    borderWidth: 2, borderStyle: "dashed", borderRadius: 16,
    height: 120, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4,
  },
  reviewCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden", padding: 16 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  reviewLabel: { fontSize: 12, fontWeight: "500", flex: 1 },
  reviewValue: { fontSize: 13, fontWeight: "600", flex: 2, textAlign: "right" },
  primaryBtn: {
    backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 15,
    alignItems: "center", justifyContent: "center", flexDirection: "row",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  planCard: { borderRadius: 18, padding: 18, borderWidth: 1 },
  planName: { fontSize: 18, fontWeight: "800" },
  planPrice: { fontSize: 24, fontWeight: "900", marginTop: 2 },
  planDivider: { height: 1 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  featureText: { fontSize: 13, flex: 1 },
  detailHero: {
    borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 6,
  },
  detailHeroIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  detailBillerName: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  detailBillType: { fontSize: 13, textAlign: "center" },
  detailAmount: { fontSize: 32, fontWeight: "900" },
  payLinkBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 16 },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  waBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#25D366",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8, alignSelf: "flex-start",
  },
});
