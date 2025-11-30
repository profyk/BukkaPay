import { useLocation } from "wouter";
import { ArrowLeft, Copy, Download } from "lucide-react";
import QRCode from "qrcode.react";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function MyID() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const qrRef = (null as any);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  const copyToClipboard = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      toast({ title: "Copied", description: "Wallet ID copied to clipboard", variant: "default" });
    }
  };

  const downloadQR = () => {
    const element = document.getElementById("qr-code") as HTMLCanvasElement;
    if (element) {
      const url = element.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `${user?.username}-wallet-qr.png`;
      link.href = url;
      link.click();
      toast({ title: "Downloaded", description: "QR code saved to your device", variant: "default" });
    }
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background pb-8">
      {/* Header */}
      <header className="px-6 pt-8 pb-6 flex items-center gap-4">
        <button
          onClick={() => navigate?.("/")}
          className="p-2 hover:bg-secondary rounded-xl transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-heading font-bold">My Wallet ID</h1>
      </header>

      <div className="px-6">
        {/* QR Code Card */}
        <div className="bg-white dark:bg-card rounded-3xl p-8 shadow-lg border border-border mb-6">
          <p className="text-center text-muted-foreground text-sm mb-6">Scan to receive payments instantly</p>
          
          <div className="flex justify-center bg-white p-4 rounded-2xl mb-6">
            <QRCode
              id="qr-code"
              value={JSON.stringify({ userId: user.id, username: user.username, walletId: user.walletId })}
              size={256}
              level="H"
              includeMargin={true}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>

          <button
            onClick={downloadQR}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors font-semibold mb-3"
            data-testid="button-download-qr"
          >
            <Download size={18} />
            Download QR Code
          </button>
        </div>

        {/* Wallet ID Card */}
        <div className="bg-white dark:bg-card rounded-3xl p-6 shadow-lg border border-border">
          <p className="text-muted-foreground text-sm mb-2">Your Wallet ID</p>
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 px-4 py-3 rounded-xl bg-secondary font-mono font-semibold text-sm break-all">
              {user.walletId || "BKP-XXXXXXXX"}
            </code>
            <button
              onClick={copyToClipboard}
              className="p-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
              data-testid="button-copy-wallet-id"
            >
              <Copy size={18} />
            </button>
          </div>

          {/* User Info */}
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Username</p>
              <p className="font-semibold">{user.username}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Display Name</p>
              <p className="font-semibold">{user.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Email</p>
              <p className="font-semibold text-sm break-all">{user.email}</p>
            </div>
            {user.phone && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Phone</p>
                <p className="font-semibold">{user.countryCode} {user.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
          <p className="text-sm text-foreground">
            <strong>💡 Tip:</strong> Share your wallet ID or QR code with friends to receive peer-to-peer payments instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
