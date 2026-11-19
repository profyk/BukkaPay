import { Link, useLocation } from "wouter"
import {
  LayoutDashboard, Users, ArrowRightLeft, LogOut,
  CreditCard, FileCheck, ScrollText, Wallet,
  Link2, Store, Megaphone, ChevronRight,
  ShieldCheck, Settings2, Globe2, PlaneTakeoff, Route as RouteIcon,
  MessageCircle, Stamp, BookOpen, Scale, BadgeCheck, Map as MapIcon, Coins, Landmark, PlugZap, Waypoints,
  ShieldAlert, Gavel,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAdminMe, usePermissions } from "@/lib/permissions"

type NavItem = { href: string; label: string; icon: any; perm?: string }

const SECTIONS: { label: string; links: NavItem[] }[] = [
  {
    label: "Overview",
    links: [
      { href: "/",              label: "Dashboard",        icon: LayoutDashboard, perm: "dashboard.view" },
      { href: "/approvals",     label: "Approvals",        icon: Stamp,           perm: "approvals.view" },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/users",         label: "Users",            icon: Users,           perm: "users.view" },
      { href: "/kyc",           label: "KYC Review",       icon: FileCheck,       perm: "kyc.view" },
      { href: "/support-chat",  label: "Support Chat",     icon: MessageCircle,   perm: "support.view" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/transactions",  label: "Transactions",     icon: ArrowRightLeft,  perm: "transactions.view" },
      { href: "/wallets",       label: "Wallets",          icon: Wallet,          perm: "wallets.view" },
      { href: "/cards",         label: "Visa Cards",       icon: CreditCard,      perm: "wallets.view" },
      { href: "/payment-links", label: "Payment Links",    icon: Link2,           perm: "transactions.view" },
      { href: "/cross-border",  label: "Cross-Border",     icon: Globe2,          perm: "transactions.view" },
      { href: "/ledger",        label: "Ledger",           icon: BookOpen,        perm: "ledger.view" },
      { href: "/reconciliation",label: "Reconciliation",   icon: Scale,           perm: "reconciliation.view" },
    ],
  },
  {
    label: "Merchants",
    links: [
      { href: "/merchants",     label: "Merchants",        icon: Store,           perm: "merchants.view" },
      { href: "/merchant-kyb",  label: "Business Verification", icon: BadgeCheck, perm: "merchants.view" },
    ],
  },
  {
    label: "Network",
    links: [
      { href: "/network/countries",  label: "Countries",      icon: MapIcon,  perm: "network.view" },
      { href: "/network/currencies", label: "Currencies",     icon: Coins,    perm: "network.view" },
      { href: "/network/custodians", label: "Custodians",     icon: Landmark, perm: "network.view" },
      { href: "/network/providers",  label: "Providers",      icon: PlugZap,  perm: "network.view" },
      { href: "/network/corridors",  label: "Corridors & FX", icon: Waypoints, perm: "network.view" },
      { href: "/fees",               label: "Fees & Limits",  icon: Settings2, perm: "fees.view" },
    ],
  },
  {
    label: "Risk & Governance",
    links: [
      { href: "/compliance",       label: "Compliance",     icon: ShieldAlert, perm: "compliance.view" },
      { href: "/audit-logs",       label: "Audit Log",      icon: ScrollText,  perm: "audit.view" },
      { href: "/admin-management", label: "Admins & Roles", icon: ShieldCheck, perm: "admins.manage" },
    ],
  },
  {
    label: "Other",
    links: [
      { href: "/broadcast",        label: "Broadcast",        icon: Megaphone,    perm: "broadcast.send" },
      { href: "/website",          label: "Website",          icon: Globe2,       perm: "website.view" },
      { href: "/legal",            label: "Legal Documents",  icon: Gavel,        perm: "legal.view" },
      { href: "/travel-operators", label: "Travel Operators", icon: PlaneTakeoff, perm: "travel.manage" },
      { href: "/travel-routes",    label: "Travel Routes",    icon: RouteIcon,    perm: "travel.manage" },
    ],
  },
]

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
  const [location] = useLocation()
  const isActive = location === href
  return (
    <Link href={href} className="block">
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer group",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
            : "text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground"
        )}
      >
        <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary-foreground" : "")} />
        <span className="flex-1">{label}</span>
        {!isActive && <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />}
      </div>
    </Link>
  )
}

export function Sidebar() {
  const { logout } = useAuth()
  const { data: me } = useAdminMe()
  const perms = usePermissions()

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 shrink-0">
      {/* Logo */}
      <div className="p-5 pb-4">
        <img
          src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
          alt="BukkaPay Technologies"
          className="h-10 w-auto"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-4 py-2">
        {SECTIONS.map((section) => {
          const links = section.links.filter((l) => !l.perm || perms.can(l.perm))
          if (!links.length) return null
          return (
            <div key={section.label}>
              <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {links.map((link) => <NavLink key={link.href} href={link.href} label={link.label} icon={link.icon} />)}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="px-3 py-2 rounded-xl bg-muted/30">
          <p className="text-xs text-muted-foreground font-medium">Signed in as</p>
          {me ? (
            <>
              <p className="text-sm font-semibold text-sidebar-foreground truncate mt-0.5">{me.name || me.email}</p>
              {me.role && (
                <p className={cn("text-xs capitalize font-medium", me.role === "super_admin" ? "text-violet-500" : "text-muted-foreground")}>
                  {me.role.replace(/_/g, " ")}{me.mfaEnabled === false && " · MFA off"}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-sidebar-foreground mt-0.5">BukkaPay Admin</p>
          )}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-sm"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of BukkaPay Admin?</AlertDialogTitle>
              <AlertDialogDescription>
                You will be redirected to the login page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={logout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  )
}
