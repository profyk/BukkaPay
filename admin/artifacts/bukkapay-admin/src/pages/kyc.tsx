import { useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, CheckCircle2, XCircle, Loader2, FileText, Clock } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useKyc, useKycActions, type KycSubmission } from "@/hooks/use-kyc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"

function docLabel(type: string) {
  const map: Record<string, string> = {
    passport: "Passport",
    national_id: "National ID",
    driver_license: "Driver's License",
  }
  return map[type] ?? type
}

function statusBadge(status: string) {
  switch (status) {
    case "approved": return <Badge variant="success">Approved</Badge>
    case "rejected": return <Badge variant="destructive">Rejected</Badge>
    default:         return <Badge variant="warning">Pending</Badge>
  }
}

export default function KycPage() {
  const { data: submissions, isLoading, isError, error } = useKyc()
  const { approveKyc, rejectKyc } = useKycActions()
  const { toast } = useToast()

  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<KycSubmission | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    try {
      await approveKyc.mutateAsync(id)
      toast({ title: "KYC Approved", description: "User verification has been approved." })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectDialog) return
    setProcessingId(rejectDialog.id)
    try {
      await rejectKyc.mutateAsync({ id: rejectDialog.id, reason: rejectReason })
      toast({ title: "KYC Rejected", description: "User has been notified." })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setProcessingId(null)
      setRejectDialog(null)
      setRejectReason("")
    }
  }

  const pending  = submissions?.filter((s) => s.status === "pending")  ?? []
  const reviewed = submissions?.filter((s) => s.status !== "pending")  ?? []

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div>
          <h1 className="text-3xl font-display">KYC Verification</h1>
          <p className="text-muted-foreground mt-1">Review and approve identity verification submissions.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h3 className="font-bold">Failed to load KYC submissions</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          <>
            {/* Pending */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold">Pending Review ({pending.length})</h2>
              </div>

              {pending.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                  All KYC submissions have been reviewed.
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">User</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Full Name</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Document</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Submitted</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {pending.map((s) => (
                          <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium">{s.user_email}</td>
                            <td className="px-6 py-4">{s.full_name}</td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-muted-foreground">{docLabel(s.document_type)}</span>
                              <span className="ml-2 font-mono text-xs bg-muted px-2 py-0.5 rounded">{s.document_number}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(s.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {processingId === s.id ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                ) : (
                                  <>
                                    <Button size="sm" variant="success" onClick={() => handleApprove(s.id)}>
                                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setRejectDialog(s)}>
                                      <XCircle className="w-4 h-4 mr-1.5" /> Reject
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Reviewed */}
            {reviewed.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-muted-foreground">Previously Reviewed ({reviewed.length})</h2>
                </div>
                <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">User</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Full Name</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Document</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Status</th>
                          <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reviewed.map((s) => (
                          <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium">{s.user_email}</td>
                            <td className="px-6 py-4">{s.full_name}</td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">{docLabel(s.document_type)}</td>
                            <td className="px-6 py-4">{statusBadge(s.status)}</td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">{s.rejection_reason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </motion.div>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC Submission</DialogTitle>
            <DialogDescription>
              Rejecting KYC for <strong>{rejectDialog?.user_email}</strong>. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full mt-2 rounded-xl border border-border bg-muted p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={4}
            placeholder="e.g. Document is blurry or information does not match..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || !!processingId}
              onClick={handleReject}
            >
              {processingId ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
