import { Link, useLocation } from "wouter"
import { LayoutDashboard, Users, ArrowRightLeft, LogOut, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"

export function Sidebar() {
  const [location] = useLocation()
  const { logout } = useAuth()

  const links = [
    { href: "/", label: "Users", icon: Users },
    { href: "/transactions", label: "Transactions", icon: ArrowRightLeft },
  ]

  return (
    <aside className="w-72 bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0">
      <div className="p-8 flex items-center gap-3">
        <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
          <Wallet className="w-6 h-6 text-primary-foreground" />
        </div>
        <span className="text-2xl font-display font-bold text-sidebar-foreground tracking-tight">
          BukkaPay
        </span>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
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

      <div className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          onClick={logout}
          className="w-full justify-start text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground"
        >
          <LogOut className="w-5 h-5 mr-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
