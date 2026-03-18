import { useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, CheckCircle2, ShieldBan, Trash2, Loader2, MoreHorizontal } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useUsers, useUserActions } from "@/hooks/use-users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"

export default function UsersPage() {
  const { data: users, isLoading, isError, error } = useUsers()
  const { freezeUser, activateUser, deleteUser } = useUserActions()
  const { toast } = useToast()

  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleAction = async (action: 'freeze' | 'activate' | 'delete', id: string) => {
    try {
      setProcessingId(id)
      if (action === 'freeze') await freezeUser.mutateAsync(id)
      if (action === 'activate') await activateUser.mutateAsync(id)
      if (action === 'delete') await deleteUser.mutateAsync(id)
      
      toast({
        title: "Action Successful",
        description: `User successfully ${action}d.`,
      })
    } catch (err: any) {
      toast({
        title: "Action Failed",
        description: err.message || "Failed to update user status.",
        variant: "destructive"
      })
    } finally {
      setProcessingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'active': return <Badge variant="success">Active</Badge>
      case 'frozen': return <Badge variant="warning">Frozen</Badge>
      case 'deleted': return <Badge variant="destructive">Deleted</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">Users Management</h1>
            <p className="text-muted-foreground mt-1">View and manage all BukkaPay registered users.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border shadow-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h3 className="text-lg font-bold">Failed to load users</h3>
            <p className="text-sm opacity-80">{error?.message || "Please check your connection and try again."}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Role</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  )}
                  {users?.map((user) => {
                    const isFrozenOrDeleted = ['frozen', 'deleted'].includes(user.status.toLowerCase());
                    const isProcessing = processingId === user.id;

                    return (
                      <tr 
                        key={user.id} 
                        className={`transition-colors hover:bg-muted/30 ${isFrozenOrDeleted ? 'bg-destructive/5' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">{user.email}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-muted-foreground capitalize">{user.role}</span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(user.status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isProcessing ? (
                            <Loader2 className="w-5 h-5 text-primary animate-spin inline-block mr-3" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {user.status.toLowerCase() !== 'active' && (
                                  <DropdownMenuItem onClick={() => handleAction('activate', user.id)} className="cursor-pointer text-success focus:text-success focus:bg-success/10">
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Activate Account
                                  </DropdownMenuItem>
                                )}
                                {user.status.toLowerCase() !== 'frozen' && user.status.toLowerCase() !== 'deleted' && (
                                  <DropdownMenuItem onClick={() => handleAction('freeze', user.id)} className="cursor-pointer text-warning focus:text-warning focus:bg-warning/10">
                                    <ShieldBan className="w-4 h-4 mr-2" />
                                    Freeze Account
                                  </DropdownMenuItem>
                                )}
                                {user.status.toLowerCase() !== 'deleted' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleAction('delete', user.id)} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete Account
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
