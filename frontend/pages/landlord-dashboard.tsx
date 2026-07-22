import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, ActivityIndicator, Modal, Share, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "../hooks/use-toast";
import { apiRequest, queryClient } from "../lib/queryClient";
import * as Clipboard from "expo-clipboard";
import { APP_URL } from "../lib/config";
import * as Linking from "expo-linking";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

const PURPLE = "#7C3AED";
const PURPLE_LIGHT = "#EDE9FE";
const logoImage = require("../assets/logo.png");

interface Property {
  id: string;
  name: string;
  address: string;
  propertyType: string;
  totalUnits: number;
  isActive: boolean;
  createdAt: string;
}

interface PropertyUnit {
  id: string;
  propertyId: string;
  unitNumber: string;
  monthlyRent: string;
  isOccupied: boolean;
}

interface TenantDetail {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  monthlyRent: number;
  amountPaid: number;
  status: 'unpaid' | 'partial' | 'paid';
}

interface DashboardData {
  totalProperties: number;
  totalTenants: number;
  totalIncome: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  properties: Property[];
  tenants: TenantDetail[];
}

interface Merchant {
  id: string;
  businessName: string;
  businessType: string;
}

function getPropertyIcon(type: string): keyof typeof Ionicons.glyphMap {
  const t = type.toLowerCase();
  if (t.includes("hostel") || t.includes("dorm")) return "bed-outline";
  if (t.includes("student") || t.includes("res") || t.includes("campus")) return "school-outline";
  if (t.includes("house")) return "home-outline";
  if (t.includes("commercial")) return "storefront-outline";
  return "business-outline";
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function LandlordDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const { colors, darkMode } = useTheme();
  const styles = getStyles(colors, darkMode);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [requestPaymentOpen, setRequestPaymentOpen] = useState(false);
  const [selectedTenantForPayment, setSelectedTenantForPayment] = useState<TenantDetail | null>(null);
  const [generatedPaymentLink, setGeneratedPaymentLink] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tenants" | "properties">("tenants");
  const [addUnitPropertyId, setAddUnitPropertyId] = useState<string | null>(null);
  const [addUnitPropertyName, setAddUnitPropertyName] = useState("");

  const [newProperty, setNewProperty] = useState({
    name: "",
    address: "",
    propertyType: "apartment",
    totalUnits: 1,
    merchantId: "",
  });

  const [newUnit, setNewUnit] = useState({
    unitNumber: "",
    monthlyRent: "",
  });

  const [newTenant, setNewTenant] = useState({
    name: "",
    email: "",
    phone: "",
    propertyId: "",
    unitId: "",
  });

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/rental/dashboard"],
  });

  const { data: merchants } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: units } = useQuery<PropertyUnit[]>({
    queryKey: ["/api/rental/properties", selectedProperty, "units"],
    enabled: !!selectedProperty,
  });

  const propertyMerchants = merchants?.filter(m => m.businessType.toLowerCase() === "property") || [];

  const createPropertyMutation = useMutation({
    mutationFn: async (data: typeof newProperty) => {
      return apiRequest("POST", "/api/rental/properties", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rental/dashboard"] });
      setAddPropertyOpen(false);
      setNewProperty({ name: "", address: "", propertyType: "apartment", totalUnits: 1, merchantId: "" });
      toast({ title: "Property added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add property", description: error.message, variant: "destructive" });
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: async (data: typeof newUnit) => {
      return apiRequest("POST", `/api/rental/properties/${addUnitPropertyId || selectedProperty}/units`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rental/properties", addUnitPropertyId || selectedProperty, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rental/dashboard"] });
      setAddUnitOpen(false);
      setNewUnit({ unitNumber: "", monthlyRent: "" });
      toast({ title: "Unit added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add unit", description: error.message, variant: "destructive" });
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: typeof newTenant) => {
      return apiRequest("POST", "/api/rental/tenants", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rental/dashboard"] });
      setAddTenantOpen(false);
      setNewTenant({ name: "", email: "", phone: "", propertyId: "", unitId: "" });
      toast({ title: "Tenant added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add tenant", description: error.message, variant: "destructive" });
    },
  });

  const createPaymentLinkMutation = useMutation({
    mutationFn: async (data: { tenantId: string; amount: number; rentMonth?: string }) => {
      return apiRequest("POST", "/api/rental/payment-links", data);
    },
    onSuccess: async (response: any) => {
      const data = await response.json();
      const fullLink = `${APP_URL}${data.shareableLink}`;
      setGeneratedPaymentLink(fullLink);
      toast({ title: "Payment link generated!" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate payment link", description: error.message, variant: "destructive" });
    },
  });

  const handleRequestPayment = (tenant: TenantDetail) => {
    setSelectedTenantForPayment(tenant);
    setGeneratedPaymentLink(null);
    setRequestPaymentOpen(true);
  };

  const generatePaymentLink = () => {
    if (!selectedTenantForPayment) return;
    const dueAmount = selectedTenantForPayment.monthlyRent - selectedTenantForPayment.amountPaid;
    if (dueAmount <= 0) {
      toast({ title: "No amount due", description: "This tenant has no outstanding balance", variant: "destructive" });
      return;
    }
    createPaymentLinkMutation.mutate({
      tenantId: selectedTenantForPayment.id,
      amount: dueAmount,
    });
  };

  const copyPaymentLink = async () => {
    if (generatedPaymentLink) {
      await Clipboard.setStringAsync(generatedPaymentLink);
      toast({ title: "Payment link copied!" });
    }
  };

  const sharePaymentLink = async () => {
    if (!generatedPaymentLink || !selectedTenantForPayment) return;
    try {
      await Share.share({
        message: `Hi ${selectedTenantForPayment.name}, please pay your rent of R${(selectedTenantForPayment.monthlyRent - selectedTenantForPayment.amountPaid).toFixed(2)} via this link: ${generatedPaymentLink}`,
      });
    } catch {
      copyPaymentLink();
    }
  };

  const shareViaWhatsApp = async () => {
    if (!generatedPaymentLink || !selectedTenantForPayment) return;
    const due = (selectedTenantForPayment.monthlyRent - selectedTenantForPayment.amountPaid).toFixed(2);
    const msg = `Hi ${selectedTenantForPayment.name}, your rent payment of R${due} is due. Please pay via this secure link: ${generatedPaymentLink}`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      sharePaymentLink();
    }
  };

  const copyTenantId = async (tenantId: string) => {
    await Clipboard.setStringAsync(tenantId);
    toast({ title: "Tenant ID copied!" });
  };

  const vacantUnits = units?.filter(u => !u.isOccupied) || [];

  const propertyTypes = [
    { value: "hostel", label: "Hostel" },
    { value: "student_residence", label: "Student Res" },
    { value: "apartment", label: "Apartment" },
    { value: "house", label: "House" },
    { value: "condo", label: "Condo" },
    { value: "commercial", label: "Commercial" },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Image source={logoImage} style={styles.loadingLogo} />
        <Text style={styles.loadingBrand}>BukkaPay</Text>
        <ActivityIndicator size="large" color={PURPLE} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const paidRate = dashboard && dashboard.totalTenants > 0
    ? Math.round((dashboard.paidCount / dashboard.totalTenants) * 100)
    : 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Image source={logoImage} style={styles.headerLogo} />
          <View>
            <Text style={styles.headerTitle}>Property Manager</Text>
            <Text style={styles.headerSub}>Hostels & Student Residences</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => setAddTenantOpen(true)}>
          <Ionicons name="person-add-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>

        {/* ─── KPI Strip ──────────────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: darkMode ? "rgba(124,58,237,0.15)" : "#F5F3FF", borderColor: darkMode ? "rgba(124,58,237,0.3)" : "#DDD6FE" }]}>
            <View style={[styles.kpiIcon, { backgroundColor: PURPLE }]}>
              <Ionicons name="business-outline" size={16} color="#fff" />
            </View>
            <Text style={[styles.kpiValue, { color: PURPLE }]}>{dashboard?.totalProperties || 0}</Text>
            <Text style={styles.kpiLabel}>Properties</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: darkMode ? "rgba(59,130,246,0.15)" : "#EFF6FF", borderColor: darkMode ? "rgba(59,130,246,0.3)" : "#BFDBFE" }]}>
            <View style={[styles.kpiIcon, { backgroundColor: "#3B82F6" }]}>
              <Ionicons name="people-outline" size={16} color="#fff" />
            </View>
            <Text style={[styles.kpiValue, { color: "#3B82F6" }]}>{dashboard?.totalTenants || 0}</Text>
            <Text style={styles.kpiLabel}>Tenants</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: darkMode ? "rgba(16,185,129,0.15)" : "#ECFDF5", borderColor: darkMode ? "rgba(16,185,129,0.3)" : "#A7F3D0" }]}>
            <View style={[styles.kpiIcon, { backgroundColor: "#10B981" }]}>
              <Ionicons name="cash-outline" size={16} color="#fff" />
            </View>
            <Text style={[styles.kpiValue, { color: "#10B981" }]}>R{(dashboard?.totalIncome || 0).toFixed(0)}</Text>
            <Text style={styles.kpiLabel}>Income</Text>
          </View>
        </View>

        {/* ─── Payment Status Banner ─────────────────────────────── */}
        <View style={styles.statusBanner}>
          <View style={styles.statusBannerLeft}>
            <Text style={styles.statusBannerTitle}>Payment Status</Text>
            <Text style={styles.statusBannerSub}>{paidRate}% of tenants paid</Text>
          </View>
          <View style={styles.statusPills}>
            <View style={[styles.statusPill, { backgroundColor: darkMode ? "rgba(16,185,129,0.15)" : "#ECFDF5" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#10B981" }]} />
              <Text style={[styles.statusPillText, { color: darkMode ? "#34D399" : "#059669" }]}>{dashboard?.paidCount || 0} Paid</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: darkMode ? "rgba(245,158,11,0.15)" : "#FFFBEB" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={[styles.statusPillText, { color: darkMode ? "#FBBF24" : "#D97706" }]}>{dashboard?.partialCount || 0} Partial</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: darkMode ? "rgba(239,68,68,0.15)" : "#FEF2F2" }]}>
              <View style={[styles.statusDot, { backgroundColor: "#EF4444" }]} />
              <Text style={[styles.statusPillText, { color: darkMode ? "#F87171" : "#DC2626" }]}>{dashboard?.unpaidCount || 0} Unpaid</Text>
            </View>
          </View>
        </View>

        {/* ─── Tab Bar ────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "tenants" && styles.tabActive]}
            onPress={() => setActiveTab("tenants")}
          >
            <Ionicons name="people-outline" size={16} color={activeTab === "tenants" ? PURPLE : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "tenants" && styles.tabTextActive]}>Tenants</Text>
            {activeTab === "tenants" && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "properties" && styles.tabActive]}
            onPress={() => setActiveTab("properties")}
          >
            <Ionicons name="business-outline" size={16} color={activeTab === "properties" ? PURPLE : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === "properties" && styles.tabTextActive]}>Properties</Text>
            {activeTab === "properties" && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        </View>

        {/* ─── Tenants Tab ────────────────────────────────────────── */}
        {activeTab === "tenants" && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tenant Management</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setAddTenantOpen(true)}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Tenant</Text>
              </TouchableOpacity>
            </View>

            {dashboard?.tenants.length === 0 && (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="people-outline" size={32} color={PURPLE} />
                </View>
                <Text style={styles.emptyTitle}>No Tenants Yet</Text>
                <Text style={styles.emptyText}>Add a property and unit first, then add tenants.</Text>
              </View>
            )}

            {dashboard?.tenants.map((tenant, idx) => {
              const statusColor = tenant.status === 'paid' ? '#10B981' : tenant.status === 'partial' ? '#F59E0B' : '#EF4444';
              const statusBg = darkMode
                ? (tenant.status === 'paid' ? "rgba(16,185,129,0.15)" : tenant.status === 'partial' ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)")
                : (tenant.status === 'paid' ? '#ECFDF5' : tenant.status === 'partial' ? '#FFFBEB' : '#FEF2F2');
              const statusLabel = tenant.status === 'paid' ? 'Paid' : tenant.status === 'partial' ? 'Partial' : 'Unpaid';
              const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const due = tenant.monthlyRent - tenant.amountPaid;
              const unitLabel = /^\d+$/.test(tenant.unitNumber) ? `Room ${tenant.unitNumber}` : `Unit ${tenant.unitNumber}`;

              return (
                <View key={tenant.id} style={styles.tenantCard}>
                  <View style={styles.tenantTop}>
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                      <Text style={styles.avatarText}>{getInitials(tenant.name)}</Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <View style={styles.tenantNameRow}>
                        <Text style={styles.tenantName}>{tenant.name}</Text>
                        <View style={[styles.statusPillSmall, { backgroundColor: statusBg }]}>
                          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                          <Text style={[styles.statusPillSmallText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.tenantSub}>{tenant.propertyName} · {unitLabel}</Text>
                      <View style={styles.tenantIdRow}>
                        <Text style={styles.tenantIdText}>ID: {tenant.tenantId}</Text>
                        <TouchableOpacity onPress={() => copyTenantId(tenant.tenantId)} style={styles.copyBtn}>
                          <Ionicons name="copy-outline" size={11} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Rent Details Row */}
                  <View style={styles.rentRow}>
                    <View style={styles.rentCell}>
                      <Text style={styles.rentCellLabel}>Monthly Rent</Text>
                      <Text style={styles.rentCellValue}>R{tenant.monthlyRent.toFixed(2)}</Text>
                    </View>
                    <View style={styles.rentDivider} />
                    <View style={styles.rentCell}>
                      <Text style={styles.rentCellLabel}>Paid</Text>
                      <Text style={[styles.rentCellValue, { color: "#10B981" }]}>R{tenant.amountPaid.toFixed(2)}</Text>
                    </View>
                    <View style={styles.rentDivider} />
                    <View style={styles.rentCell}>
                      <Text style={styles.rentCellLabel}>Due</Text>
                      <Text style={[styles.rentCellValue, { color: due > 0 ? "#EF4444" : "#10B981" }]}>
                        R{due.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Request Payment */}
                  {tenant.status !== 'paid' && (
                    <TouchableOpacity style={styles.requestPayBtn} onPress={() => handleRequestPayment(tenant)}>
                      <Ionicons name="send-outline" size={14} color="#fff" />
                      <Text style={styles.requestPayBtnText}>Send Payment Request</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ─── Properties Tab ─────────────────────────────────────── */}
        {activeTab === "properties" && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Property Management</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setAddPropertyOpen(true)}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Property</Text>
              </TouchableOpacity>
            </View>

            {dashboard?.properties.length === 0 && (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="business-outline" size={32} color={PURPLE} />
                </View>
                <Text style={styles.emptyTitle}>No Properties Yet</Text>
                <Text style={styles.emptyText}>Create a Property merchant account first, then add properties.</Text>
              </View>
            )}

            {dashboard?.properties.map((property) => {
              const iconName = getPropertyIcon(property.propertyType);
              const typeLabel = property.propertyType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
              return (
                <View key={property.id} style={styles.propertyCard}>
                  <View style={styles.propertyTop}>
                    <View style={styles.propertyIconBox}>
                      <Ionicons name={iconName} size={22} color={PURPLE} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.propertyName}>{property.name}</Text>
                      <Text style={styles.propertyAddress}>{property.address || "No address set"}</Text>
                      <View style={styles.propertyTypePill}>
                        <Text style={styles.propertyTypePillText}>{typeLabel}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.addUnitButton}
                      onPress={() => {
                        setAddUnitPropertyId(property.id);
                        setAddUnitPropertyName(property.name);
                        setSelectedProperty(property.id);
                        setAddUnitOpen(true);
                      }}
                    >
                      <Ionicons name="add" size={14} color={PURPLE} />
                      <Text style={styles.addUnitText}>Add Room</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </View>

      {/* ─── Add Tenant Modal ────────────────────────────────────── */}
      <Modal visible={addTenantOpen} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddTenantOpen(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Tenant</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              placeholder="Tenant's full name"
              placeholderTextColor={colors.textMuted}
              value={newTenant.name}
              onChangeText={(v) => setNewTenant({ ...newTenant, name: v })}
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Email Address</Text>
            <TextInput
              placeholder="tenant@email.com"
              placeholderTextColor={colors.textMuted}
              value={newTenant.email}
              onChangeText={(v) => setNewTenant({ ...newTenant, email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Phone Number</Text>
            <TextInput
              placeholder="+27 XX XXX XXXX"
              placeholderTextColor={colors.textMuted}
              value={newTenant.phone}
              onChangeText={(v) => setNewTenant({ ...newTenant, phone: v })}
              keyboardType="phone-pad"
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Property</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {dashboard?.properties.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.selectChip, newTenant.propertyId === p.id && styles.selectChipActive]}
                  onPress={() => {
                    setNewTenant({ ...newTenant, propertyId: p.id, unitId: "" });
                    setSelectedProperty(p.id);
                  }}
                >
                  <Text style={[styles.selectChipText, newTenant.propertyId === p.id && styles.selectChipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {newTenant.propertyId ? (
              <>
                <Text style={[styles.inputLabel, { marginTop: 16 }]}>Room / Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {vacantUnits.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.selectChip, newTenant.unitId === u.id && styles.selectChipActive]}
                      onPress={() => setNewTenant({ ...newTenant, unitId: u.id })}
                    >
                      <Text style={[styles.selectChipText, newTenant.unitId === u.id && styles.selectChipTextActive]}>
                        {/^\d+$/.test(u.unitNumber) ? `Room ${u.unitNumber}` : u.unitNumber} · R{u.monthlyRent}/mo
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, createTenantMutation.isPending && { opacity: 0.5 }]}
              onPress={() => createTenantMutation.mutate(newTenant)}
              disabled={createTenantMutation.isPending}
            >
              <Text style={styles.primaryButtonText}>
                {createTenantMutation.isPending ? "Adding..." : "Add Tenant"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>

      {/* ─── Add Property Modal ─────────────────────────────────── */}
      <Modal visible={addPropertyOpen} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddPropertyOpen(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Property</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.inputLabel, { marginTop: 0 }]}>Property Name</Text>
            <TextInput
              placeholder="e.g., Sunrise Student Hostel"
              placeholderTextColor={colors.textMuted}
              value={newProperty.name}
              onChangeText={(v) => setNewProperty({ ...newProperty, name: v })}
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Address</Text>
            <TextInput
              placeholder="123 Main St, City"
              placeholderTextColor={colors.textMuted}
              value={newProperty.address}
              onChangeText={(v) => setNewProperty({ ...newProperty, address: v })}
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Property Type</Text>
            <View style={styles.propertyTypeGrid}>
              {propertyTypes.map((pt) => {
                const isActive = newProperty.propertyType === pt.value;
                const icon = getPropertyIcon(pt.value);
                return (
                  <TouchableOpacity
                    key={pt.value}
                    style={[styles.propertyTypeCard, isActive && styles.propertyTypeCardActive]}
                    onPress={() => setNewProperty({ ...newProperty, propertyType: pt.value })}
                  >
                    <Ionicons name={icon} size={20} color={isActive ? PURPLE : colors.textMuted} />
                    <Text style={[styles.propertyTypeCardText, isActive && { color: PURPLE }]}>{pt.label}</Text>
                    {isActive && <View style={styles.propertyTypeCheck}><Ionicons name="checkmark-circle" size={14} color={PURPLE} /></View>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, createPropertyMutation.isPending && { opacity: 0.5 }]}
              onPress={() => createPropertyMutation.mutate(newProperty)}
              disabled={createPropertyMutation.isPending}
            >
              <Text style={styles.primaryButtonText}>
                {createPropertyMutation.isPending ? "Creating..." : "Create Property"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>

      {/* ─── Add Unit Modal ─────────────────────────────────────── */}
      <Modal visible={addUnitOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAddUnitOpen(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Room to {addUnitPropertyName}</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.inputLabel}>Room / Unit Number</Text>
            <TextInput
              placeholder="e.g., 101, A1, Ground Floor"
              placeholderTextColor={colors.textMuted}
              value={newUnit.unitNumber}
              onChangeText={(v) => setNewUnit({ ...newUnit, unitNumber: v })}
              style={styles.textInput}
            />

            <Text style={[styles.inputLabel, { marginTop: 16 }]}>Monthly Rent (R)</Text>
            <TextInput
              placeholder="e.g., 3500"
              placeholderTextColor={colors.textMuted}
              value={newUnit.monthlyRent}
              onChangeText={(v) => setNewUnit({ ...newUnit, monthlyRent: v })}
              keyboardType="numeric"
              style={styles.textInput}
            />

            <TouchableOpacity
              style={[styles.primaryButton, createUnitMutation.isPending && { opacity: 0.5 }]}
              onPress={() => createUnitMutation.mutate(newUnit)}
              disabled={createUnitMutation.isPending}
            >
              <Text style={styles.primaryButtonText}>
                {createUnitMutation.isPending ? "Adding..." : "Add Room"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Request Payment Modal ───────────────────────────────── */}
      <Modal visible={requestPaymentOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setRequestPaymentOpen(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Request Rent Payment</Text>
            <View style={{ width: 36 }} />
          </View>

          {selectedTenantForPayment && (
            <View style={styles.modalBody}>
              {/* Tenant info card */}
              <View style={styles.paymentInfoCard}>
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[0], marginBottom: 8 }]}>
                  <Text style={styles.avatarText}>{getInitials(selectedTenantForPayment.name)}</Text>
                </View>
                <Text style={styles.paymentInfoName}>{selectedTenantForPayment.name}</Text>
                <Text style={styles.paymentInfoSub}>
                  {selectedTenantForPayment.propertyName} · Unit {selectedTenantForPayment.unitNumber}
                </Text>
                <View style={styles.paymentInfoAmountRow}>
                  <Text style={styles.paymentInfoLabel}>Amount Due</Text>
                  <Text style={styles.paymentInfoAmount}>
                    R{(selectedTenantForPayment.monthlyRent - selectedTenantForPayment.amountPaid).toFixed(2)}
                  </Text>
                </View>
              </View>

              {!generatedPaymentLink ? (
                <TouchableOpacity
                  style={[styles.primaryButton, createPaymentLinkMutation.isPending && { opacity: 0.5 }]}
                  onPress={generatePaymentLink}
                  disabled={createPaymentLinkMutation.isPending}
                >
                  <Ionicons name="link" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    {createPaymentLinkMutation.isPending ? "Generating..." : "Generate Payment Link"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <View style={styles.linkGeneratedCard}>
                    <View style={styles.linkGeneratedHeader}>
                      <Ionicons name="checkmark-circle" size={20} color="#059669" />
                      <Text style={styles.linkGeneratedTitle}>Payment Link Ready!</Text>
                    </View>
                    <Text style={styles.linkGeneratedUrl}>{generatedPaymentLink}</Text>
                  </View>

                  <View style={styles.linkButtonsRow}>
                    <TouchableOpacity style={styles.outlineButton} onPress={copyPaymentLink}>
                      <Ionicons name="copy-outline" size={16} color={PURPLE} />
                      <Text style={styles.outlineButtonText}>Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.shareBtn, { backgroundColor: "#25D366" }]} onPress={shareViaWhatsApp}>
                      <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
                      <Text style={styles.shareBtnText}>WhatsApp</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.shareBtn, { backgroundColor: PURPLE }]} onPress={sharePaymentLink}>
                      <Ionicons name="share-social-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.shareBtnText}>Share</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.hintText}>
                    Send this link to your tenant. They can pay securely even without a BukkaPay account.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

function getStyles(colors: ThemeColors, darkMode: boolean) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  loadingLogo: { width: 64, height: 64, borderRadius: 18 },
  loadingBrand: { fontSize: 20, fontWeight: "800", color: PURPLE, marginTop: 12 },

  // ── Header
  header: {
    backgroundColor: PURPLE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 56 : 44,
    paddingBottom: 20,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 36, height: 36, borderRadius: 10 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 },

  // ── Body
  body: { paddingHorizontal: 20, paddingTop: 20 },

  // ── KPI Strip
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 4,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  kpiValue: { fontSize: 18, fontWeight: "800" },
  kpiLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },

  // ── Status Banner
  statusBanner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statusBannerLeft: { marginBottom: 12 },
  statusBannerTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  statusBannerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusPills: { flexDirection: "row", gap: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 12, fontWeight: "600" },

  // ── Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 20,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
    position: "relative",
  },
  tabActive: { backgroundColor: PURPLE_LIGHT },
  tabText: { fontSize: 14, color: colors.textMuted, fontWeight: "500" },
  tabTextActive: { color: PURPLE, fontWeight: "700" },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: PURPLE,
    borderRadius: 2,
  },

  // ── Section Header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: PURPLE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  // ── Empty States
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 36,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PURPLE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },

  // ── Tenant Card
  tenantCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tenantTop: { flexDirection: "row", gap: 12, marginBottom: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  tenantNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  tenantName: { fontSize: 15, fontWeight: "700", color: colors.text },
  statusPillSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillSmallText: { fontSize: 11, fontWeight: "700" },
  tenantSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  tenantIdRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tenantIdText: { fontSize: 11, color: colors.textMuted },
  copyBtn: { padding: 2 },

  rentRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  rentCell: { flex: 1, alignItems: "center" },
  rentCellLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600", marginBottom: 4 },
  rentCellValue: { fontSize: 14, fontWeight: "700", color: colors.text },
  rentDivider: { width: 1, backgroundColor: colors.border },

  requestPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 10,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  requestPayBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // ── Property Card
  propertyCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  propertyTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  propertyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: PURPLE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyName: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 2 },
  propertyAddress: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  propertyTypePill: {
    alignSelf: "flex-start",
    backgroundColor: PURPLE_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  propertyTypePillText: { fontSize: 11, fontWeight: "600", color: PURPLE },
  addUnitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addUnitText: { fontSize: 12, color: PURPLE, fontWeight: "700" },

  // ── Modals
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  modalBody: { paddingHorizontal: 20, paddingTop: 20 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 8 },
  textInput: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: 8,
    justifyContent: "center",
  },
  selectChipActive: { borderColor: PURPLE, backgroundColor: PURPLE_LIGHT },
  selectChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  selectChipTextActive: { color: PURPLE, fontWeight: "700" },

  // Property type grid in modal
  propertyTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  propertyTypeCard: {
    width: "30%",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  propertyTypeCardActive: { borderColor: PURPLE, backgroundColor: PURPLE_LIGHT },
  propertyTypeCardText: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, textAlign: "center" },
  propertyTypeCheck: { position: "absolute", top: 4, right: 4 },

  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 32,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  // Payment modal
  paymentInfoCard: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  paymentInfoName: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  paymentInfoSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 12, textAlign: "center" },
  paymentInfoAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
  },
  paymentInfoLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  paymentInfoAmount: { fontSize: 18, fontWeight: "800", color: "#EF4444" },
  linkGeneratedCard: {
    backgroundColor: darkMode ? "rgba(16,185,129,0.15)" : "#ECFDF5",
    borderWidth: 1,
    borderColor: darkMode ? "rgba(16,185,129,0.3)" : "#A7F3D0",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  linkGeneratedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  linkGeneratedTitle: { fontSize: 14, fontWeight: "700", color: darkMode ? "#34D399" : "#059669" },
  linkGeneratedUrl: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  linkButtonsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  outlineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: PURPLE,
    borderRadius: 12,
    height: 44,
  },
  outlineButtonText: { fontSize: 14, fontWeight: "700", color: PURPLE },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    height: 44,
  },
  shareBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  hintText: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  });
}
