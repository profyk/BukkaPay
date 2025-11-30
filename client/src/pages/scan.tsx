import { useState } from "react";
import { ArrowLeft, QrCode, Share2 } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

export default function Scan() {
  const [mode, setMode] = useState<'scan' | 'my-code'>('scan');

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      {/* Camera Viewport Mock (Only visible in scan mode) */}
      {mode === 'scan' && (
        <div className="absolute inset-0 bg-neutral-900 z-0">
          <div className="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-gray-900 to-black" />
        </div>
      )}
      
      {/* My Code Background (Only visible in my-code mode) */}
      {mode === 'my-code' && (
        <div className="absolute inset-0 bg-primary z-0">
             <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-primary to-primary" />
        </div>
      )}

      {/* Overlays */}
      <div className="relative z-10 flex flex-col h-full p-6">
        <div className="flex justify-between items-center pt-8">
          <Link href="/">
            <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <h1 className="font-heading font-bold text-lg">{mode === 'scan' ? 'Scan Code' : 'My Code'}</h1>
          {mode === 'my-code' ? (
             <button className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors">
               <Share2 size={20} />
             </button>
          ) : <div className="w-10" />}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
          <AnimatePresence mode="wait">
            {mode === 'scan' ? (
              <motion.div 
                key="scan"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative w-64 h-64"
              >
                {/* Scanning Frame */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                
                <motion.div 
                  className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_20px_rgba(124,58,237,0.8)]"
                  animate={{ top: ["10%", "90%", "10%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
                
                <div className="w-full h-full flex items-center justify-center text-white/20">
                   <QrCode size={64} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0, rotateY: 90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: -90 }}
                className="bg-white rounded-3xl p-8 shadow-2xl"
              >
                <QrCode size={200} className="text-black" />
                <p className="text-black text-center mt-4 font-bold font-heading">@alex_morgan</p>
              </motion.div>
            )}
          </AnimatePresence>
          
          <p className="text-white/80 text-sm text-center max-w-xs h-6">
            {mode === 'scan' ? 'Align the QR code within the frame.' : 'Show this code to receive money.'}
          </p>
        </div>

        {/* Toggle Buttons */}
        <div className="pb-8 flex justify-center space-x-8">
           <button 
             onClick={() => setMode('scan')}
             className={`flex flex-col items-center space-y-2 transition-all ${mode === 'scan' ? 'opacity-100 scale-110' : 'opacity-50'}`}
           >
             <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${mode === 'scan' ? 'bg-white text-black' : 'bg-white/20'}`}>
               <QrCode size={24} />
             </div>
             <span className="text-xs font-medium">Scan</span>
           </button>

           <button 
             onClick={() => setMode('my-code')}
             className={`flex flex-col items-center space-y-2 transition-all ${mode === 'my-code' ? 'opacity-100 scale-110' : 'opacity-50'}`}
           >
             <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${mode === 'my-code' ? 'bg-white text-black' : 'bg-white/20'}`}>
               <QrCode size={24} />
             </div>
             <span className="text-xs font-medium">My Code</span>
           </button>
        </div>
      </div>
    </div>
  );
}
