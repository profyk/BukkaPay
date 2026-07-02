import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface KycSubmission {
  id: string;
  user_id: string;
  user_email: string;
  full_name: string;
  document_type: "passport" | "national_id" | "driver_license" | string;
  document_number: string;
  status: "pending" | "approved" | "rejected" | string;
  submitted_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export const KYC_QUERY_KEY = ["kyc"];

export function useKyc() {
  return useQuery({
    queryKey: KYC_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/kyc");
      return ((data as any).kyc ?? data) as KycSubmission[];
    },
  });
}

export function useKycActions() {
  const queryClient = useQueryClient();

  const approveKyc = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/kyc/${id}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_QUERY_KEY }),
  });

  const rejectKyc = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/admin/kyc/${id}/reject`, { reason });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KYC_QUERY_KEY }),
  });

  return { approveKyc, rejectKyc };
}
