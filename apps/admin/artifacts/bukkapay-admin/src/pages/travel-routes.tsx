import { useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle, Loader2, Plus, ChevronDown, ChevronUp, ArrowRight,
  CalendarClock, Users, Power, PowerOff,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import {
  useTravelOperators, useTravelRoutes, useCreateRoute, useUpdateRoute,
  useDepartures, useCreateDeparture, useUpdateDeparture, type TravelRoute,
} from "@/hooks/use-travel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const BLANK_ROUTE = {
  originCode: "", originCity: "", originCountryCode: "",
  destinationCode: "", destinationCity: "", destinationCountryCode: "", flightNumber: "",
}
const BLANK_DEPARTURE = { departureAt: "", arrivalAt: "", price: "", businessPrice: "", currency: "ZAR", totalSeats: "40" }

function DeparturesPanel({ route }: { route: TravelRoute }) {
  const { data: departures, isLoading } = useDepartures(route.id)
  const createDeparture = useCreateDeparture(route.id)
  const updateDeparture = useUpdateDeparture(route.id)
  const { toast } = useToast()
  const [form, setForm] = useState(BLANK_DEPARTURE)
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!form.departureAt || !form.arrivalAt || !form.price) {
      toast({ title: "Departure time, arrival time, and price are required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await createDeparture.mutateAsync({
        departureAt: new Date(form.departureAt).toISOString(),
        arrivalAt: new Date(form.arrivalAt).toISOString(),
        price: form.price,
        businessPrice: form.businessPrice || undefined,
        currency: form.currency,
        totalSeats: parseInt(form.totalSeats, 10) || 40,
      })
      toast({ title: "Departure added" })
      setForm(BLANK_DEPARTURE)
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (departureId: string, isActive: boolean) => {
    try {
      await updateDeparture.mutateAsync({ id: departureId, isActive: !isActive })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    }
  }

  return (
    <div className="bg-muted/30 px-6 py-5 border-t border-border space-y-4">
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      ) : !departures?.length ? (
        <p className="text-sm text-muted-foreground">No departures scheduled yet.</p>
      ) : (
        <div className="space-y-2">
          {departures.map((d) => (
            <div key={d.id} className={`flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 ${!d.isActive ? "opacity-50" : ""}`}>
              <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{formatDate(d.departureAt, true)}</p>
                <p className="text-xs text-muted-foreground">Arrives {formatDate(d.arrivalAt, true)}</p>
              </div>
              <div className="text-sm font-bold text-foreground">{d.currency} {d.price}</div>
              {d.businessPrice && <div className="text-xs text-muted-foreground">Biz {d.currency} {d.businessPrice}</div>}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />{d.seatsBooked}/{d.totalSeats}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(d.id, d.isActive)}>
                {d.isActive ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-emerald-500" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end pt-2 border-t border-border">
        <div className="space-y-1 col-span-1">
          <label className="text-xs font-medium text-muted-foreground">Departs</label>
          <Input type="datetime-local" value={form.departureAt} onChange={(e) => setForm((f) => ({ ...f, departureAt: e.target.value }))} />
        </div>
        <div className="space-y-1 col-span-1">
          <label className="text-xs font-medium text-muted-foreground">Arrives</label>
          <Input type="datetime-local" value={form.arrivalAt} onChange={(e) => setForm((f) => ({ ...f, arrivalAt: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Price</label>
          <Input placeholder="500.00" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </div>
        {route.mode === "flight" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Business price</label>
            <Input placeholder="optional" value={form.businessPrice} onChange={(e) => setForm((f) => ({ ...f, businessPrice: e.target.value }))} />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Currency</label>
          <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Seats</label>
          <Input type="number" value={form.totalSeats} onChange={(e) => setForm((f) => ({ ...f, totalSeats: e.target.value }))} />
        </div>
        <Button size="sm" disabled={saving} onClick={handleAdd} className="col-span-2 sm:col-span-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Add</>}
        </Button>
      </div>
    </div>
  )
}

export default function TravelRoutesPage() {
  const { data: operators } = useTravelOperators()
  const [operatorFilter, setOperatorFilter] = useState<string>("all")
  const { data: routes, isLoading, isError, error } = useTravelRoutes(operatorFilter === "all" ? undefined : operatorFilter)
  const createRoute = useCreateRoute()
  const updateRoute = useUpdateRoute()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [routeOperatorId, setRouteOperatorId] = useState("")
  const [form, setForm] = useState(BLANK_ROUTE)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const selectedOperator = operators?.find((o) => o.id === routeOperatorId)

  const handleCreate = async () => {
    if (!routeOperatorId) {
      toast({ title: "Choose an operator first", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await createRoute.mutateAsync({ operatorId: routeOperatorId, ...form, flightNumber: form.flightNumber || undefined })
      toast({ title: "Route added" })
      setCreateOpen(false)
      setForm(BLANK_ROUTE)
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (route: TravelRoute) => {
    try {
      await updateRoute.mutateAsync({ id: route.id, isActive: !route.isActive })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    }
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display">Routes & Pricing</h1>
            <p className="text-muted-foreground mt-1">Origins, destinations, and per-departure ticket prices — this is Travel Booking's pricing control.</p>
          </div>
          <Button onClick={() => { setForm(BLANK_ROUTE); setRouteOperatorId(operators?.[0]?.id ?? ""); setCreateOpen(true) }} disabled={!operators?.length}>
            <Plus className="w-4 h-4 mr-2" />New Route
          </Button>
        </div>

        <Select value={operatorFilter} onValueChange={setOperatorFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All operators" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All operators</SelectItem>
            {operators?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <p className="font-semibold">Failed to load routes</p>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !routes?.length ? (
          <div className="flex items-center justify-center h-32 bg-card rounded-2xl border border-border text-muted-foreground text-sm">
            No routes yet.
          </div>
        ) : (
          <div className="space-y-3">
            {routes.map((route) => (
              <div key={route.id} className={`bg-card rounded-2xl border border-border shadow-sm overflow-hidden ${!route.isActive ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-4 px-6 py-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-semibold text-foreground">{route.originCity}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-foreground">{route.destinationCity}</span>
                    {route.flightNumber && <Badge variant="outline" className="ml-2">{route.flightNumber}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{route.operator?.name}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title={route.isActive ? "Deactivate" : "Activate"}
                    onClick={() => handleToggleActive(route)}>
                    {route.isActive ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-emerald-500" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExpanded(expanded === route.id ? null : route.id)}>
                    Departures {expanded === route.id ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </Button>
                </div>
                {expanded === route.id && <DeparturesPanel route={route} />}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Route</DialogTitle>
            <DialogDescription>A fixed origin/destination pair for an operator. Add departures (dates, prices, seats) after saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Operator</label>
              <Select value={routeOperatorId} onValueChange={setRouteOperatorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {operators?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} ({o.mode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Origin city</label>
                <Input placeholder="Johannesburg" value={form.originCity} onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">{selectedOperator?.mode === "flight" ? "Origin airport code" : "Origin code"}</label>
                <Input placeholder={selectedOperator?.mode === "flight" ? "JNB" : "Johannesburg"} value={form.originCode} onChange={(e) => setForm((f) => ({ ...f, originCode: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Origin country code</label>
                <Input placeholder="ZA" maxLength={2} value={form.originCountryCode} onChange={(e) => setForm((f) => ({ ...f, originCountryCode: e.target.value.toUpperCase() }))} />
              </div>
              <div />
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Destination city</label>
                <Input placeholder="Cape Town" value={form.destinationCity} onChange={(e) => setForm((f) => ({ ...f, destinationCity: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">{selectedOperator?.mode === "flight" ? "Destination airport code" : "Destination code"}</label>
                <Input placeholder={selectedOperator?.mode === "flight" ? "CPT" : "Cape Town"} value={form.destinationCode} onChange={(e) => setForm((f) => ({ ...f, destinationCode: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Destination country code</label>
                <Input placeholder="ZA" maxLength={2} value={form.destinationCountryCode} onChange={(e) => setForm((f) => ({ ...f, destinationCountryCode: e.target.value.toUpperCase() }))} />
              </div>
              {selectedOperator?.mode === "flight" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Flight number</label>
                  <Input placeholder="SA1234" value={form.flightNumber} onChange={(e) => setForm((f) => ({ ...f, flightNumber: e.target.value }))} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleCreate}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
