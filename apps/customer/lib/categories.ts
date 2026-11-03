// Send Money category / sub-category taxonomy. `id` is what's sent to the
// backend as purposeCategory (matches app.models.enums.TransferPurpose);
// sub-categories are free-text labels stored as purposeSubcategory.
export interface TransferCategory {
  id: string;
  label: string;
  icon: string; // Ionicons name
  subcategories: string[];
}

export const TRANSFER_CATEGORIES: TransferCategory[] = [
  {
    id: "family_friends",
    label: "Family & Friends",
    icon: "people-outline",
    subcategories: ["Allowance", "Emergency Support", "Special Occasion"],
  },
  {
    id: "business",
    label: "Business",
    icon: "briefcase-outline",
    subcategories: ["Supplier Payment", "Salary / Wages", "Invoice Settlement"],
  },
  {
    id: "bills_rent",
    label: "Bills & Rent",
    icon: "home-outline",
    subcategories: ["Rent", "Utilities", "Loan Repayment"],
  },
  {
    id: "school_fees",
    label: "School Fees",
    icon: "school-outline",
    subcategories: ["Tuition", "Accommodation", "Books & Supplies"],
  },
  {
    id: "medical",
    label: "Medical",
    icon: "medkit-outline",
    subcategories: ["Hospital Bill", "Medication", "Insurance"],
  },
  {
    id: "gift",
    label: "Gift",
    icon: "gift-outline",
    subcategories: ["Birthday", "Wedding", "Holiday"],
  },
  {
    id: "other",
    label: "Other",
    icon: "ellipsis-horizontal-outline",
    subcategories: [],
  },
];

export function getCategory(id: string): TransferCategory | undefined {
  return TRANSFER_CATEGORIES.find((c) => c.id === id);
}
