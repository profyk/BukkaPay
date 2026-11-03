import { motion } from "framer-motion"
import {
  Users, ArrowRightLeft, AlertTriangle, Wallet,
  TrendingUp, Clock, Loader2, AlertCircle, RefreshCw,
  Store, Link2,
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts"
import { AppLayout } from "@/components/layout/AppLayout"
import { useDashboard } from "@/hooks/use-dashboard"
import { formatCurrency } from "@/lib/utils"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08 } }),
}

function StatCard({
  label, value, icon: Icon, color, sub, index,
}: {
  label: string; value: string | number; icon: any;
  color: string; sub?: string; index: number;
}) {
  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="show"
      className="bg-card rounded-2xl border border-border p-6 flex items-start gap-4 shadow-sm"
    >
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard()

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Platform overview and key metrics.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-3">
            <AlertCircle className="w-10 h-10" />
            <div className="text-center">
              <h3 className="font-bold">Failed to load dashboard</h3>
              <p className="text-sm opacity-80 mt-1">{(error as any)?.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard index={0} label="Total Users"         value={(data?.totalUsers ?? 0).toLocaleString()}        icon={Users}          color="bg-primary"         sub={`${data?.activeUsers ?? 0} active · ${data?.frozenUsers ?? 0} frozen`} />
              <StatCard index={1} label="Total Transactions"  value={(data?.totalTransactions ?? 0).toLocaleString()} icon={ArrowRightLeft}  color="bg-blue-500"        sub="Platform-wide" />
              <StatCard index={2} label="Total Volume"        value={formatCurrency(data?.totalVolume ?? 0)}        icon={Wallet}         color="bg-emerald-500"     sub="All time ZAR" />
              <StatCard index={3} label="Pending KYC"         value={data?.pendingKyc ?? 0}                         icon={Clock}          color="bg-amber-500"       sub="Awaiting verification" />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Transaction volume */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.35 } }}
                className="bg-card rounded-2xl border border-border p-6 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-foreground">Transaction Volume</h2>
                </div>
                {data?.recentTransactions?.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.recentTransactions} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem" }}
                        formatter={(v: number) => [formatCurrency(v), "Volume"]}
                      />
                      <Area type="monotone" dataKey="volume" stroke="#4F46E5" strokeWidth={2} fill="url(#volGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
                )}
              </motion.div>

              {/* User growth */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.45 } }}
                className="bg-card rounded-2xl border border-border p-6 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-6">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <h2 className="font-semibold text-foreground">New User Registrations</h2>
                </div>
                {data?.userGrowth?.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.userGrowth} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem" }}
                        formatter={(v: number) => [v, "New Users"]}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
                )}
              </motion.div>
            </div>

            {/* Bottom quick-stats */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.55 } }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {[
                { label: "Frozen Accounts",      value: data?.frozenUsers ?? 0,           icon: AlertTriangle, color: "text-amber-500",    href: "/users" },
                { label: "Merchants",             value: data?.totalMerchants ?? 0, icon: Store, color: "text-violet-500",  href: "/merchants" },
                { label: "Active Payment Links",  value: data?.activePaymentLinks ?? 0, icon: Link2, color: "text-emerald-500", href: "/payment-links" },
              ].map(({ label, value, icon: Icon, color, href }) => (
                <Link key={label} href={href} className="block">
                  <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-primary/40 transition-colors cursor-pointer">
                    <Icon className={`w-6 h-6 ${color}`} />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{label}</p>
                      <p className="text-xl font-bold">{value?.toLocaleString() ?? "—"}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </motion.div>
    </AppLayout>
  )
}
