import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import cardBg from "@assets/generated_images/abstract_gradient_for_card_background.png";

interface WalletCardProps {
  title: string;
  balance: number;
  currency: string;
  cardNumber: string;
  color: string;
  icon: any;
  className?: string;
}

export default function WalletCard({ title, balance, currency, cardNumber, color, icon: Icon, className }: WalletCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn("relative overflow-hidden rounded-2xl p-6 text-white shadow-xl aspect-[1.58/1]", className)}
    >
      {/* Background Gradient/Image */}
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", color)} />
      <div className="absolute inset-0 bg-black/10" />
      
      {/* Texture Overlay */}
      <div className="absolute inset-0 opacity-30 mix-blend-overlay" 
           style={{ backgroundImage: `url(${cardBg})`, backgroundSize: 'cover' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-full">
              <Icon size={18} className="text-white" />
            </div>
            <span className="font-medium tracking-wide opacity-90">{title}</span>
          </div>
          <span className="font-bold text-lg italic opacity-80">VISA</span>
        </div>

        <div>
          <div className="text-sm opacity-70 mb-1">Balance</div>
          <div className="text-3xl font-bold font-heading tracking-tight">
            {currency}{balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="font-mono opacity-80 tracking-widest text-sm">{cardNumber}</div>
          <div className="text-xs opacity-70">12/28</div>
        </div>
      </div>
    </motion.div>
  );
}
