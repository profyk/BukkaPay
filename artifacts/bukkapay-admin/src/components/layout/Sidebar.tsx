import { Link, useLocation } from "wouter"
import { Users, ArrowRightLeft, LogOut } from "lucide-react"
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
      <div className="p-6 flex items-center">
        <img
          src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`}
          alt="BukkaPay Technologies"
          className="h-14 w-auto"
        />
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
