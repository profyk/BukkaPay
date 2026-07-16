import { Link, useLocation } from "wouter"
import {
  LayoutDashboard, Users, ArrowRightLeft, LogOut,
  FlaskConical, FileCheck, ScrollText, Wallet,
  Link2, Store, Megaphone, ChevronRight,
  ShieldCheck, Settings2, Globe2, PlaneTakeoff, Route as RouteIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { isDemoMode } from "@/lib/demo"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAdminMe, usePermissions } from "@/lib/permissions"

const SECTIONS = [
  {
    label: "Overview",
    links: [
      { href: "/",             label: "Dashboard",       icon: LayoutDashboard },
    ],
  },
  {
    label: "Users",
    links: [
      { href: "/users",        label: "Users",           icon: Users },
      { href: "/kyc",          label: "KYC Review",      icon: FileCheck },
    ],
  },
  {
    label: "Finance",
    links: [
      { href: "/transactions", label: "Transactions",    icon: ArrowRightLeft },
      { href: "/wallets",      label: "Wallets",         icon: Wallet },
      { href: "/payment-links",label: "Payment Links",   icon: Link2 },
      { href: "/international-transfers", label: "International Transfers", icon: Globe2 },
    ],
  },
  {
    label: "Travel",
    links: [
      { href: "/travel-operators", label: "Operators", icon: PlaneTakeoff },
      { href: "/travel-routes",    label: "Routes & Pricing", icon: RouteIcon },
    ],
  },
  {
    label: "Platform",
    links: [
      { href: "/merchants",    label: "Merchants",       icon: Store },
      { href: "/broadcast",    label: "Broadcast",       icon: Megaphone },
      { href: "/audit-logs",   label: "Audit Log",       icon: ScrollText },
    ],
  },
]

const SUPER_ADMIN_SECTION = {
  label: "Super Admin",
  links: [
    { href: "/admin-management", label: "Admin Management", icon: ShieldCheck },
    { href: "/pricing",          label: "Platform Pricing",  icon: Settings2 },
    { href: "/corridors",        label: "Cross-Border FX",   icon: Globe2 },
  ],
}

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
  const demo = isDemoMode()
  const { data: me } = useAdminMe()
  const { isSuperAdmin } = usePermissions()

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

      {demo && (
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary">Demo Mode</span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-4 py-2">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.links.map((link) => <NavLink key={link.href} {...link} />)}
            </div>
          </div>
        ))}

        {/* Super Admin section — only visible to super_admin role */}
        {isSuperAdmin && (
          <div>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-violet-500/70">
              {SUPER_ADMIN_SECTION.label}
            </p>
            <div className="space-y-0.5">
              {SUPER_ADMIN_SECTION.links.map((link) => <NavLink key={link.href} {...link} />)}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="px-3 py-2 rounded-xl bg-muted/30">
          <p className="text-xs text-muted-foreground font-medium">Signed in as</p>
          {demo ? (
            <>
              <p className="text-sm font-semibold text-sidebar-foreground mt-0.5">Demo User</p>
              <p className="text-xs text-violet-500 font-medium">Super Admin</p>
            </>
          ) : me ? (
            <>
              <p className="text-sm font-semibold text-sidebar-foreground truncate mt-0.5">{me.name || me.email}</p>
              {me.role && (
                <p className={cn("text-xs capitalize font-medium", me.role === "super_admin" ? "text-violet-500" : "text-muted-foreground")}>
                  {me.role.replace("_", " ")}
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
                {demo
                  ? "This will exit demo mode and return you to the login page."
                  : "You will be redirected to the login page."}
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
