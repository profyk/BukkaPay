import { Link, useLocation } from "wouter"
import {
  LayoutDashboard, Users, ArrowRightLeft, LogOut,
  FlaskConical, FileCheck, ScrollText, Wallet,
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

const NAV_LINKS = [
  { href: "/",            label: "Dashboard",     icon: LayoutDashboard },
  { href: "/users",       label: "Users",         icon: Users },
  { href: "/transactions",label: "Transactions",  icon: ArrowRightLeft },
  { href: "/wallets",     label: "Wallets",       icon: Wallet },
  { href: "/kyc",         label: "KYC Review",    icon: FileCheck },
  { href: "/audit-logs",  label: "Audit Log",     icon: ScrollText },
]

export function Sidebar() {
  const [location] = useLocation()
  const { logout } = useAuth()
  const demo = isDemoMode()

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 shrink-0">
      <div className="p-5 flex items-center">
        <img
          src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
          alt="BukkaPay Technologies"
          className="h-12 w-auto"
        />
      </div>

      {demo && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary">Demo Mode</span>
        </div>
      )}

      <nav className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = location === href
          return (
            <Link key={href} href={href} className="block">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-4.5 h-4.5 shrink-0", isActive ? "text-primary-foreground" : "")} />
                {label}
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Signed in as</p>
          <p className="text-sm font-medium text-sidebar-foreground truncate mt-0.5">
            {demo ? "Demo User" : "BukkaPay Admin"}
          </p>
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
              <AlertDialogAction
                onClick={logout}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sign Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </aside>
  )
}
