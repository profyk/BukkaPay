import { Link, useLocation } from "wouter"
import { Users, ArrowRightLeft, LogOut, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { isDemoMode } from "@/lib/demo"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function Sidebar() {
  const [location] = useLocation()
  const { logout } = useAuth()
  const demo = isDemoMode()

  const links = [
    { href: "/", label: "Users", icon: Users },
    { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  ]

  return (
    <aside className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
          alt="BukkaPay Technologies"
          className="h-14 w-auto"
        />
      </div>

      {demo && (
        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <FlaskConical className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary">Demo Mode — Sample Data</span>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-2 mt-2">
        {links.map((link) => {
          const Icon = link.icon
          const isActive = location === link.href

          return (
            <Link key={link.href} href={link.href} className="block">
              <div
                className={cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-foreground")} />
                {link.label}
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Signed in as</p>
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {demo ? "Demo User" : "BukkaPay Admin"}
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="w-5 h-5 mr-4" />
              Sign Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of BukkaPay Admin?</AlertDialogTitle>
              <AlertDialogDescription>
                {demo
                  ? "This will exit demo mode and return you to the login page."
                  : "You will be redirected to the login page. Any unsaved changes will be lost."}
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
