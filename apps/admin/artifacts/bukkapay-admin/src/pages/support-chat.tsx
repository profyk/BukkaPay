import { useState, useRef, useEffect } from "react"
import { formatDistanceToNow } from "date-fns"
import { motion } from "framer-motion"
import { MessageCircle, Send, Search, Loader2, Headset } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useConversations, useConversation, useSendReply } from "@/hooks/use-support-chat"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"
}

export default function SupportChatPage() {
  const { data, isLoading } = useConversations()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [reply, setReply] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const conversations = data?.conversations ?? []
  const filtered = conversations.filter((c) =>
    !search.trim() || c.user.name.toLowerCase().includes(search.toLowerCase()) || c.user.email.toLowerCase().includes(search.toLowerCase())
  )
  const selected = conversations.find((c) => c.user.id === selectedUserId)

  const { data: messages = [], isLoading: messagesLoading } = useConversation(selectedUserId)
  const sendReply = useSendReply(selectedUserId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const handleSend = () => {
    if (!reply.trim() || sendReply.isPending) return
    sendReply.mutate(reply.trim())
    setReply("")
  }

  return (
    <AppLayout>
      <div className="space-y-6 h-full flex flex-col">
        <div>
          <h1 className="text-3xl font-display">Support Chat</h1>
          <p className="text-muted-foreground mt-1">Reply to users directly — same as a WhatsApp inbox, backed by BukkaPay.</p>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-0 border border-border rounded-2xl overflow-hidden bg-card shadow-sm" style={{ height: "calc(100vh - 220px)" }}>
          {/* Conversation list */}
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search conversations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                  <MessageCircle className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No support conversations yet.</p>
                </div>
              )}

              {filtered.map((c) => (
                <button
                  key={c.user.id}
                  onClick={() => setSelectedUserId(c.user.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border hover:bg-muted/50 transition-colors",
                    selectedUserId === c.user.id && "bg-muted"
                  )}
                >
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">{initials(c.user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{c.user.name}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: false })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                      {c.unreadCount > 0 && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white h-5 min-w-5 px-1.5 rounded-full text-[10px] shrink-0">
                          {c.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Thread */}
          <div className="flex flex-col min-h-0 bg-[#ECE5DD] dark:bg-[#0B141A]">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Headset className="w-10 h-10" />
                <p className="text-sm">Select a conversation to start replying</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 bg-card border-b border-border flex items-center gap-3">
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">{initials(selected.user.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm">{selected.user.name}</p>
                    <p className="text-xs text-muted-foreground">{selected.user.email}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {messagesLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={cn("flex", m.isUserMessage ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-xl px-3 py-2 text-sm shadow-sm",
                          m.isUserMessage ? "bg-white dark:bg-neutral-800 rounded-tl-sm" : "bg-emerald-100 dark:bg-emerald-900/40 rounded-tr-sm"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <p className="text-[10px] text-muted-foreground text-right mt-1">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                <div className="p-3 bg-card border-t border-border flex items-center gap-2">
                  <Input
                    placeholder="Type a reply..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sendReply.isPending}
                    className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
                  >
                    {sendReply.isPending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
