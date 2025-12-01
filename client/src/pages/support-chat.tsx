import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function SupportChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", text: "Hello! How can we help you today?", isUser: false, timestamp: new Date() },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInput("");

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        "I'm here to help! What's your question?",
        "Let me look into that for you.",
        "Thanks for reaching out! Is there anything else I can help with?",
        "That's a great question! Here are some resources that might help.",
      ];

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responses[Math.floor(Math.random() * responses.length)],
        isUser: false,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center relative border-b border-border">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Support Chat</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" data-testid="messages-container">
        {messages.map((message, idx) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                message.isUser
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-none"
                  : "bg-secondary rounded-bl-none"
              }`}
              data-testid={`message-${idx}`}
            >
              <p className="text-sm">{message.text}</p>
              <p className={`text-xs mt-1 ${message.isUser ? "text-violet-100" : "text-muted-foreground"}`}>
                {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 pb-6 pt-4 border-t border-border">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="input-message"
          />
          <button
            onClick={handleSend}
            className="p-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-violet-500/20 transition-all"
            data-testid="button-send"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
