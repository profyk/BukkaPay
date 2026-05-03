import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput,
  Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { API_BASE } from "../lib/config";
import { getAuthHeader } from "../lib/auth";

const PRIMARY = "#7C3AED";
const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "NGN", "KES", "GHS", "UGX"];

interface InvoiceItem {
  name: string;
  quantity: string;
  unitPrice: string;
}

const SHARE_URL_BASE = "https://app.bukkapay.com/pay";

export default function CreatePaymentLink() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 7;

  const [type, setType] = useState<"personal" | "business">("personal");
  const [senderName, setSenderName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);

  const [region, setRegion] = useState<"local" | "africa" | "international">("local");
  const [subRegion, setSubRegion] = useState("");

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [description, setDescription] = useState("");

  const [hasInvoice, setHasInvoice] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [invoiceType, setInvoiceType] = useState<"invoice" | "quotation">("invoice");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{ name: "", quantity: "1", unitPrice: "" }]);

  const [allowPartial, setAllowPartial] = useState(false);
  const [minimumPayment, setMinimumPayment] = useState("");

  const [destination, setDestination] = useState<"wallet" | "bank">("wallet");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [bankCountry, setBankCountry] = useState("");

  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [attachmentSize, setAttachmentSize] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [createdLink, setCreatedLink] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const africaRegions = ["Southern", "Western", "Eastern", "Northern", "Central"];
  const intlRegions = ["USA", "Europe", "Asia", "Other"];

  const totalInvoiceAmount = items.reduce((sum, item) => {
    return sum + (parseFloat(item.unitPrice) || 0) * (parseFloat(item.quantity) || 1);
  }, 0);

  const addItem = () => setItems([...items, { name: "", quantity: "1", unitPrice: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InvoiceItem, value: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photo library to add a business logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setBusinessLogo(`data:image/jpeg;base64,${asset.base64}`);
      } else if (asset.uri) {
        setBusinessLogo(asset.uri);
      }
    }
  };

  const pickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png", "application/msword",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const sizeKB = Math.round((asset.size || 0) / 1024);
      if (sizeKB > 4096) {
        Alert.alert("File too large", "Please choose a file under 4 MB.");
        return;
      }
      let base64: string;
      if (Platform.OS === "web") {
        const res = await fetch(asset.uri);
        const blob = await res.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      setAttachmentName(asset.name);
      setAttachmentData(base64);
      setAttachmentSize(sizeKB);
    } catch (e: any) {
      Alert.alert("Error", "Could not read the file. Please try again.");
    }
  };

  const removeAttachment = () => {
    setAttachmentName("");
    setAttachmentData(null);
    setAttachmentSize(0);
  };

  const canProceed = () => {
    if (step === 1) {
      if (type === "personal") return senderName.trim().length > 0;
      return businessName.trim().length > 0;
    }
    if (step === 3) return parseFloat(amount) > 0;
    if (step === 4 && hasInvoice) return customerName.trim().length > 0;
    if (step === 6 && destination === "bank") {
      return bankName.trim().length > 0 && accountNumber.trim().length > 0 && accountHolder.trim().length > 0;
    }
    return true;
  };

  const handleCreate = async () => {
    setIsLoading(true);
    setCreateError(null);
    setSessionExpired(false);
    try {
      const headers = await getAuthHeader();
      const body: any = {
        amount,
        currency,
        description,
        allowPartialPayment: allowPartial,
        minimumPayment: allowPartial ? minimumPayment : undefined,
        type,
        region,
        subRegion: subRegion || undefined,
        destination,
        bankDetails: destination === "bank" ? {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
          branchCode: branchCode.trim() || undefined,
          country: bankCountry.trim() || undefined,
        } : undefined,
        businessName: type === "business" ? businessName.trim() : (senderName.trim() || undefined),
        businessLogo: businessLogo || undefined,
      };

      if (hasInvoice && customerName) {
        body.invoice = {
          customerName,
          customerEmail,
          customerPhone,
          type: invoiceType,
          dueDate: dueDate || undefined,
          notes,
          items: items.filter(i => i.name.trim()).map(i => ({
            name: i.name,
            quantity: parseFloat(i.quantity) || 1,
            unitPrice: parseFloat(i.unitPrice) || 0,
          })),
          attachment: attachmentData ? {
            name: attachmentName,
            data: attachmentData,
            mimeType: attachmentName.endsWith(".pdf") ? "application/pdf"
              : attachmentName.match(/\.(jpg|jpeg|png)$/i) ? `image/${attachmentName.split(".").pop()}`
              : "application/octet-stream",
            sizeKB: attachmentSize,
          } : undefined,
        };
      }

      const res = await fetch(`${API_BASE}/api/payment-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 401) {
          setSessionExpired(true);
          throw new Error("Session expired. Please log out and log back in.");
        }
        throw new Error(err.error || "Failed to create payment link");
      }

      const data = await res.json();
      const shareUrl = `${SHARE_URL_BASE}/${data.id}`;
      setCreatedLink({ ...data, shareUrl });
      setStep(7);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (createdLink?.shareUrl) {
      await Clipboard.setStringAsync(createdLink.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    if (!createdLink?.shareUrl) return;
    const displayName = type === "business" ? businessName : senderName;
    const text = encodeURIComponent(
      `Hi! ${displayName} is requesting payment of ${createdLink.currency} ${parseFloat(createdLink.amount).toFixed(2)}${description ? ` for "${description}"` : ""}.\n\nPay securely here: ${createdLink.shareUrl}`
    );
    Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
      Linking.openURL(`https://api.whatsapp.com/send?text=${text}`)
    );
  };

  const handleShareEmail = () => {
    if (!createdLink?.shareUrl) return;
    const displayName = type === "business" ? businessName : senderName;
    const subject = encodeURIComponent(`Payment Request from ${displayName}`);
    const body = encodeURIComponent(
      `Hi,\n\n${displayName} is requesting payment of ${createdLink.currency} ${parseFloat(createdLink.amount).toFixed(2)}${description ? ` for "${description}"` : ""}.\n\nClick the link below to pay securely:\n${createdLink.shareUrl}\n\nPowered by BukkaPay`
    );
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleShareSMS = () => {
    if (!createdLink?.shareUrl) return;
    const displayName = type === "business" ? businessName : senderName;
    const text = encodeURIComponent(
      `${displayName} requests ${createdLink.currency} ${parseFloat(createdLink.amount).toFixed(2)}. Pay here: ${createdLink.shareUrl}`
    );
    Linking.openURL(`sms:?body=${text}`);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Payment Type</Text>
            <Text style={styles.stepSubtitle}>Who is this payment for?</Text>
            <View style={styles.optionRow}>
              {(["personal", "business"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.optionCard, type === t && styles.optionCardActive]}
                  onPress={() => setType(t)}
                >
                  <Ionicons name={t === "personal" ? "person" : "business"} size={36} color={type === t ? PRIMARY : "#9CA3AF"} />
                  <Text style={[styles.optionLabel, type === t && { color: PRIMARY }]}>
                    {t === "personal" ? "Personal" : "Business"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {type === "personal" && (
              <View style={styles.nameSection}>
                <Text style={styles.label}>Your Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={senderName}
                  onChangeText={setSenderName}
                  placeholder="e.g. John Doe"
                />
                <Text style={styles.hint}>This name will appear on the payment page</Text>
              </View>
            )}

            {type === "business" && (
              <View style={styles.nameSection}>
                <Text style={styles.label}>Business Name *</Text>
                <TextInput
                  style={styles.input}
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g. Acme Trading Ltd"
                />

                <Text style={[styles.label, { marginTop: 16 }]}>Business Logo</Text>
                <TouchableOpacity style={styles.logoPicker} onPress={pickLogo}>
                  {businessLogo ? (
                    <Image source={{ uri: businessLogo }} style={styles.logoPreview} />
                  ) : (
                    <View style={styles.logoPlaceholder}>
                      <Ionicons name="camera-outline" size={28} color="#9CA3AF" />
                      <Text style={styles.logoPlaceholderText}>Tap to add logo</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {businessLogo && (
                  <TouchableOpacity onPress={() => setBusinessLogo(null)} style={styles.removeLogo}>
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                    <Text style={styles.removeLogoText}>Remove logo</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.hint}>Your logo appears on the public payment page</Text>
              </View>
            )}
          </ScrollView>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Payment Region</Text>
            <Text style={styles.stepSubtitle}>Where will payment come from?</Text>
            <View style={styles.optionRow}>
              {(["local", "africa", "international"] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.optionCard, region === r && styles.optionCardActive]}
                  onPress={() => { setRegion(r); setSubRegion(""); }}
                >
                  <Ionicons
                    name={r === "local" ? "location" : r === "africa" ? "earth" : "globe"}
                    size={36} color={region === r ? PRIMARY : "#9CA3AF"}
                  />
                  <Text style={[styles.optionLabel, region === r && { color: PRIMARY }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(region === "africa" || region === "international") && (
              <View style={styles.subRegions}>
                <Text style={styles.label}>Sub-region</Text>
                <View style={styles.chipRow}>
                  {(region === "africa" ? africaRegions : intlRegions).map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, subRegion === r && styles.chipActive]}
                      onPress={() => setSubRegion(r)}
                    >
                      <Text style={[styles.chipText, subRegion === r && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Payment Details</Text>
            <Text style={styles.stepSubtitle}>Set the amount and description</Text>

            <Text style={styles.label}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
              {CURRENCIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, currency === c && styles.chipActive]}
                  onPress={() => setCurrency(c)}
                >
                  <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Amount *</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this payment for?"
              multiline
              numberOfLines={3}
            />
          </View>
        );

      case 4:
        return (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Invoice / Quotation</Text>
            <Text style={styles.stepSubtitle}>Optionally attach an invoice</Text>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Attach Invoice</Text>
              <Switch value={hasInvoice} onValueChange={setHasInvoice} trackColor={{ true: PRIMARY }} />
            </View>

            {hasInvoice && (
              <>
                <View style={styles.typeRow}>
                  {(["invoice", "quotation"] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, invoiceType === t && styles.typeBtnActive]}
                      onPress={() => setInvoiceType(t)}
                    >
                      <Text style={[styles.typeBtnText, invoiceType === t && styles.typeBtnTextActive]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Customer Name *</Text>
                <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="John Doe" />

                <Text style={styles.label}>Customer Email</Text>
                <TextInput style={styles.input} value={customerEmail} onChangeText={setCustomerEmail} placeholder="john@email.com" keyboardType="email-address" autoCapitalize="none" />

                <Text style={styles.label}>Customer Phone</Text>
                <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="+27..." keyboardType="phone-pad" />

                <Text style={styles.label}>Due Date</Text>
                <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />

                <Text style={[styles.label, { marginTop: 16 }]}>Items</Text>
                {items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <View style={styles.itemFields}>
                      <TextInput
                        style={[styles.input, styles.itemName]}
                        value={item.name}
                        onChangeText={v => updateItem(i, "name", v)}
                        placeholder="Item name"
                      />
                      <View style={styles.itemNumbers}>
                        <TextInput
                          style={[styles.input, styles.itemQty]}
                          value={item.quantity}
                          onChangeText={v => updateItem(i, "quantity", v)}
                          placeholder="Qty"
                          keyboardType="numeric"
                        />
                        <TextInput
                          style={[styles.input, styles.itemPrice]}
                          value={item.unitPrice}
                          onChangeText={v => updateItem(i, "unitPrice", v)}
                          placeholder="Price"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(i)} style={styles.removeBtn}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
                  <Ionicons name="add" size={18} color={PRIMARY} />
                  <Text style={styles.addItemText}>Add Item</Text>
                </TouchableOpacity>

                {totalInvoiceAmount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Invoice Total</Text>
                    <Text style={styles.totalValue}>{currency} {totalInvoiceAmount.toFixed(2)}</Text>
                  </View>
                )}

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes..."
                  multiline
                  numberOfLines={2}
                />

                <Text style={[styles.label, { marginTop: 20 }]}>Attach Document</Text>
                <Text style={styles.hint}>PDF, Word, or image — max 4 MB</Text>

                {attachmentData ? (
                  <View style={styles.attachedFile}>
                    <View style={styles.attachedFileIcon}>
                      <Ionicons name="document-attach" size={26} color={PRIMARY} />
                    </View>
                    <View style={styles.attachedFileInfo}>
                      <Text style={styles.attachedFileName} numberOfLines={1}>{attachmentName}</Text>
                      <Text style={styles.attachedFileSize}>{attachmentSize < 1024 ? `${attachmentSize} KB` : `${(attachmentSize / 1024).toFixed(1)} MB`}</Text>
                    </View>
                    <TouchableOpacity onPress={removeAttachment} style={styles.attachedFileRemove}>
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.attachBtn} onPress={pickPDF} activeOpacity={0.7}>
                    <Ionicons name="cloud-upload-outline" size={24} color={PRIMARY} />
                    <Text style={styles.attachBtnText}>Choose File</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        );

      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Partial Payment</Text>
            <Text style={styles.stepSubtitle}>Allow customers to pay in installments</Text>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Allow Partial Payment</Text>
              <Switch value={allowPartial} onValueChange={setAllowPartial} trackColor={{ true: PRIMARY }} />
            </View>

            {allowPartial && (
              <>
                <Text style={styles.label}>Minimum Payment ({currency})</Text>
                <TextInput
                  style={styles.input}
                  value={minimumPayment}
                  onChangeText={setMinimumPayment}
                  placeholder={`e.g. ${(parseFloat(amount || "0") * 0.5).toFixed(2)}`}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.hint}>Leave blank to allow any amount</Text>
              </>
            )}
          </View>
        );

      case 6:
        return (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Payment Destination</Text>
            <Text style={styles.stepSubtitle}>Where should the money go?</Text>

            <View style={styles.optionRow}>
              {(["wallet", "bank"] as const).map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.optionCard, destination === d && styles.optionCardActive]}
                  onPress={() => setDestination(d)}
                >
                  <Ionicons name={d === "wallet" ? "wallet" : "business"} size={36} color={destination === d ? PRIMARY : "#9CA3AF"} />
                  <Text style={[styles.optionLabel, destination === d && { color: PRIMARY }]}>
                    {d === "wallet" ? "BukkaPay Wallet" : "Bank Account"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {destination === "bank" && (
              <View style={styles.bankForm}>
                <Text style={styles.bankFormTitle}>Bank Account Details</Text>
                <Text style={styles.hint}>Payments will be transferred to this bank account</Text>

                <Text style={styles.label}>Bank Name *</Text>
                <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="e.g. First National Bank" />

                <Text style={styles.label}>Account Holder Name *</Text>
                <TextInput style={styles.input} value={accountHolder} onChangeText={setAccountHolder} placeholder="Full name as on bank account" />

                <Text style={styles.label}>Account Number *</Text>
                <TextInput style={styles.input} value={accountNumber} onChangeText={setAccountNumber} placeholder="e.g. 62123456789" keyboardType="numeric" />

                <Text style={styles.label}>Branch Code / Routing Number</Text>
                <TextInput style={styles.input} value={branchCode} onChangeText={setBranchCode} placeholder="e.g. 250655 (optional)" keyboardType="numeric" />

                <Text style={styles.label}>Country</Text>
                <TextInput style={styles.input} value={bankCountry} onChangeText={setBankCountry} placeholder="e.g. South Africa, Nigeria, USA" autoCapitalize="words" />
              </View>
            )}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <SummaryRow label="Type" value={type === "business" ? `Business — ${businessName}` : `Personal — ${senderName}`} />
              <SummaryRow label="Region" value={`${region}${subRegion ? ` — ${subRegion}` : ""}`} />
              <SummaryRow label="Amount" value={`${currency} ${parseFloat(amount || "0").toFixed(2)}`} />
              <SummaryRow label="Partial" value={allowPartial ? `Yes (min ${currency} ${minimumPayment || "any"})` : "No"} />
              <SummaryRow label="Invoice" value={hasInvoice ? `${invoiceType} for ${customerName}` : "None"} />
              <SummaryRow label="Destination" value={destination === "bank" ? `Bank: ${accountHolder || "—"}` : "BukkaPay Wallet"} />
            </View>
          </ScrollView>
        );

      case 7:
        if (isLoading) return (
          <View style={[styles.stepContent, styles.centered]}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>Creating your payment link...</Text>
          </View>
        );
        if (!createdLink) return null;

        const displayName = type === "business" ? businessName : senderName;

        return (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* Success header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Ionicons name="checkmark-circle" size={80} color="#10B981" />
              <Text style={styles.successTitle}>Link Created!</Text>
              <Text style={styles.successSubtitle}>Your payment link is ready — share it to get paid</Text>
            </View>

            {/* Prominent link box */}
            <View style={styles.linkBox}>
              <Text style={styles.linkBoxLabel}>Payment Link</Text>
              <Text style={styles.linkText} selectable>{createdLink.shareUrl}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink} activeOpacity={0.7}>
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={20} color={copied ? "#10B981" : PRIMARY} />
                <Text style={[styles.copyBtnText, copied && { color: "#10B981" }]}>
                  {copied ? "Copied to clipboard!" : "Tap to Copy Link"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick summary */}
            <View style={styles.linkDetails}>
              <SummaryRow label="Amount" value={`${createdLink.currency} ${parseFloat(createdLink.amount).toFixed(2)}`} />
              <SummaryRow label="Status" value="Active — Pending Payment" />
              {createdLink.invoice && <SummaryRow label="Invoice for" value={createdLink.invoice.customerName} />}
              {attachmentData && <SummaryRow label="Attachment" value={`📎 ${attachmentName}`} />}
            </View>

            {/* Stacked share buttons */}
            <Text style={styles.shareLabel}>Share via</Text>

            <TouchableOpacity style={[styles.shareStackBtn, { backgroundColor: "#25D366" }]} onPress={handleShareWhatsApp} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
              <Text style={styles.shareStackBtnText}>WhatsApp</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.shareStackBtn, { backgroundColor: "#2563EB" }]} onPress={handleShareEmail} activeOpacity={0.85}>
              <Ionicons name="mail" size={24} color="#FFFFFF" />
              <Text style={styles.shareStackBtnText}>Email</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.shareStackBtn, { backgroundColor: "#7C3AED" }]} onPress={handleShareSMS} activeOpacity={0.85}>
              <Ionicons name="chatbubble" size={24} color="#FFFFFF" />
              <Text style={styles.shareStackBtnText}>SMS</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.viewLinksBtn} onPress={() => router.push("/(screens)/payment-links" as any)}>
              <Ionicons name="list" size={18} color={PRIMARY} />
              <Text style={styles.viewLinksBtnText}>  View My Payment Links</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => step > 1 && step < 7 ? setStep(step - 1) : router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Payment Link</Text>
          <View style={{ width: 40 }} />
        </View>

        {step < 7 && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }]} />
          </View>
        )}
        {step < 7 && (
          <Text style={styles.stepIndicator}>Step {step} of {TOTAL_STEPS - 1}</Text>
        )}

        <View style={{ flex: 1 }}>
          {renderStep()}
        </View>

        {step < 6 && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              onPress={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        {step === 6 && (
          <View style={styles.footer}>
            {createError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.errorBannerText}>{createError}</Text>
              </View>
            )}
            {sessionExpired && (
              <TouchableOpacity
                style={styles.logoutBanner}
                onPress={async () => {
                  const { logout } = await import("../lib/auth");
                  await logout();
                  router.replace("/(auth)/login");
                }}
              >
                <Ionicons name="log-out-outline" size={18} color="#7C3AED" />
                <Text style={styles.logoutBannerText}>Tap here to log out and log back in</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, (!canProceed() || isLoading) && styles.nextBtnDisabled]}
              onPress={handleCreate}
              disabled={!canProceed() || isLoading}
            >
              {isLoading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="link" size={20} color="#FFFFFF" />
                  <Text style={styles.nextBtnText}>Create Link</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 52, paddingHorizontal: 24, paddingBottom: 12 },
  backBtn: { padding: 8, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  progressBar: { height: 4, backgroundColor: "#F3F4F6", marginHorizontal: 24, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: PRIMARY, borderRadius: 2 },
  stepIndicator: { textAlign: "center", fontSize: 12, color: "#9CA3AF", marginVertical: 8 },

  stepContent: { flex: 1, paddingHorizontal: 24 },
  stepTitle: { fontSize: 22, fontWeight: "800", color: "#1A1A2E", marginTop: 16, marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: "#6B7280", marginBottom: 24 },

  optionRow: { flexDirection: "row", gap: 14, marginBottom: 24 },
  optionCard: {
    flex: 1, borderRadius: 16, borderWidth: 2, borderColor: "#E5E7EB",
    padding: 20, alignItems: "center", gap: 10, backgroundColor: "#FAFAFA",
  },
  optionCardActive: { borderColor: PRIMARY, backgroundColor: "#F5F3FF" },
  optionLabel: { fontSize: 14, fontWeight: "700", color: "#6B7280" },

  nameSection: { marginTop: 4 },

  label: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    padding: 14, fontSize: 15, color: "#1A1A2E", backgroundColor: "#FAFAFA",
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  hint: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },

  logoPicker: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: "#E5E7EB", borderStyle: "dashed",
    overflow: "hidden", alignSelf: "center", marginBottom: 8,
  },
  logoPreview: { width: "100%", height: "100%", borderRadius: 50 },
  logoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  logoPlaceholderText: { fontSize: 11, color: "#9CA3AF" },
  removeLogo: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center", marginBottom: 4 },
  removeLogoText: { fontSize: 12, color: "#EF4444" },

  subRegions: { marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#FAFAFA" },
  chipActive: { borderColor: PRIMARY, backgroundColor: "#EDE9FE" },
  chipText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  chipTextActive: { color: PRIMARY },
  currencyScroll: { marginBottom: 16, marginHorizontal: -4, height: 44 },

  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 16 },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: "#374151" },

  typeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center" },
  typeBtnActive: { borderColor: PRIMARY, backgroundColor: "#EDE9FE" },
  typeBtnText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  typeBtnTextActive: { color: PRIMARY },

  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  itemFields: { flex: 1, gap: 6 },
  itemName: { fontSize: 14 },
  itemNumbers: { flexDirection: "row", gap: 8 },
  itemQty: { flex: 1, fontSize: 14 },
  itemPrice: { flex: 2, fontSize: 14 },
  removeBtn: { padding: 14, marginTop: 2 },
  addItemBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, marginBottom: 8 },
  addItemText: { fontSize: 14, color: PRIMARY, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#F5F3FF", borderRadius: 10, padding: 12, marginBottom: 16 },
  totalLabel: { fontSize: 14, fontWeight: "600", color: "#374151" },
  totalValue: { fontSize: 14, fontWeight: "800", color: PRIMARY },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#DC2626",
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: "#DC2626", fontWeight: "600" },
  logoutBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F5F3FF", borderWidth: 1.5, borderColor: PRIMARY,
    borderRadius: 12, padding: 12, marginBottom: 10,
  },
  logoutBannerText: { flex: 1, fontSize: 13, color: PRIMARY, fontWeight: "700" },

  attachBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderWidth: 2, borderColor: PRIMARY, borderStyle: "dashed", borderRadius: 14,
    paddingVertical: 18, marginTop: 8, backgroundColor: "#F5F3FF",
  },
  attachBtnText: { fontSize: 15, fontWeight: "700", color: PRIMARY },
  attachedFile: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14,
    padding: 14, marginTop: 8, backgroundColor: "#F5F3FF",
  },
  attachedFileIcon: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: "#EDE9FE",
    alignItems: "center", justifyContent: "center",
  },
  attachedFileInfo: { flex: 1 },
  attachedFileName: { fontSize: 13, fontWeight: "700", color: "#1A1A2E" },
  attachedFileSize: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  attachedFileRemove: { padding: 4 },

  bankForm: { marginTop: 16, gap: 4 },
  bankFormTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A2E", marginBottom: 4 },

  summaryCard: { marginTop: 24, backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16 },
  summaryTitle: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  summaryLabel: { fontSize: 13, color: "#6B7280" },
  summaryValue: { fontSize: 13, fontWeight: "600", color: "#1A1A2E", flex: 1, textAlign: "right" },

  footer: { padding: 20, paddingBottom: Platform.OS === "ios" ? 36 : 20, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#F3F4F6" },
  nextBtn: { backgroundColor: PRIMARY, borderRadius: 14, padding: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 15, color: "#6B7280" },

  successIcon: { alignItems: "center", marginTop: 32, marginBottom: 8 },
  successTitle: { fontSize: 26, fontWeight: "800", color: "#1A1A2E", textAlign: "center" },
  successSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 20 },

  linkBox: {
    borderWidth: 2, borderColor: PRIMARY, borderRadius: 14,
    backgroundColor: "#F5F3FF", padding: 16, marginBottom: 16,
  },
  linkBoxLabel: { fontSize: 11, fontWeight: "700", color: PRIMARY, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  linkText: { fontSize: 13, color: "#1A1A2E", fontWeight: "600", lineHeight: 20, marginBottom: 12 },
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: PRIMARY,
    backgroundColor: "#FFFFFF",
  },
  copyBtnText: { fontSize: 14, fontWeight: "700", color: PRIMARY },

  linkDetails: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 20 },

  shareLabel: { fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 12 },
  shareRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  shareBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", gap: 6 },
  shareBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  shareStackBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 10,
  },
  shareStackBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16, flex: 1 },

  viewLinksBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 14, padding: 14, marginTop: 8,
  },
  viewLinksBtnText: { color: PRIMARY, fontSize: 15, fontWeight: "700" },
});
