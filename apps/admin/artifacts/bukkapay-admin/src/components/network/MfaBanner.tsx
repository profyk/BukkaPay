import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { useAdminMe } from "@/lib/permissions"
import { errorMessage } from "@/components/network/kit"

/** Shown until the signed-in admin has enrolled an authenticator app.
 *  In production the API refuses every admin action until this is done. */
export function MfaBanner() {
  const { data: me } = useAdminMe()
  const qc = useQueryClient()
  const [secret, setSecret] = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  if (!me || me.mfaEnabled !== false || me.role === "master") return null

  const start = async () => {
    setError(null)
    try { setSecret((await api.post("/admin/auth/mfa/setup")).data) } catch (e) { setError(errorMessage(e)) }
  }
  const confirm = async () => {
    setError(null)
    try {
      await api.post("/admin/auth/mfa/confirm", { otp: code.trim() })
      await qc.invalidateQueries({ queryKey: ["admin-me"] })
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <p className="font-semibold">Turn on multi-factor authentication</p>
          <p className="text-muted-foreground">Admin accounts must use an authenticator app. In production, admin actions are blocked until it's on.</p>
          {!secret ? (
            <Button size="sm" onClick={start}>Set up authenticator</Button>
          ) : (
            <div className="space-y-2">
              <p>Add this key to your authenticator app (or open the link on your phone), then enter the 6-digit code.</p>
              <p className="font-mono text-xs bg-background border rounded px-2 py-1 break-all">{secret.secret}</p>
              <a className="text-primary underline text-xs break-all" href={secret.otpauth_uri}>{secret.otpauth_uri}</a>
              <div className="flex gap-2">
                <Input className="w-40" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
                <Button size="sm" onClick={confirm} disabled={code.trim().length < 6}>Confirm</Button>
              </div>
            </div>
          )}
          {error && <p className="text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
