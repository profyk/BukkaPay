import { ReactNode, useEffect } from "react"
import { useLocation } from "wouter"
import { Sidebar } from "./Sidebar"
import { useAuth } from "@/hooks/use-auth"

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login")
    }
  }, [isAuthenticated, setLocation])

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="flex-1 p-8 md:p-10 lg:p-12 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
