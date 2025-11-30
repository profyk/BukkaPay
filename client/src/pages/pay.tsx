import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth";

export default function Pay() {
  const [match, params] = useRoute("/pay/:id");
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requester, setRequester] = useState<any>(null);

  const user = getCurrentUser();
  const requestId = params?.id;

  useEffect(() => {
    if (!requestId) return;

    const fetchRequest = async () => {
      try {
        const response = await fetch(`/api/payment-requests/${requestId}`);
        if (!response.ok) throw new Error("Request not found");

        const data = await response.json();
        setRequest(data);
        setRequester(data.requester);
      } catch (error) {
        toast.error("Payment request not found or expired");
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [requestId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading payment request...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <h1 className="text-2xl font-bold mb-2">Payment Request Not Found</h1>
        <p className="text-muted-foreground mb-6">
          This request may have expired or been cancelled.
        </p>
        <Link href="/">
          <Button className="bg-violet-600 hover:bg-violet-700">Back to Home</Button>
        </Link>
      </div>
    );
  }

  const handleDownloadApp = () => {
    toast.info("Download BukkaPay from your app store");
  };

  const handleConfirmPayment = async () => {
    if (!user) {
      toast.error("Please log in to make a payment");
      return;
    }

    try {
      const response = await fetch(`/api/payment-requests/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ status: "paid" }),
      });

      if (!response.ok) throw new Error("Failed to confirm payment");

      toast.success("Payment confirmed!");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (error) {
      toast.error("Error confirming payment");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">
          Payment Request
        </h1>
      </header>

      <div className="flex-1 flex flex-col px-6 pt-8 pb-8">
        <div className="bg-secondary rounded-2xl p-6 mb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {requester?.name?.charAt(0).toUpperCase()}
          </div>
          <p className="text-muted-foreground text-sm mb-1">Payment Request from</p>
          <p className="text-xl font-semibold">{requester?.name}</p>
          <p className="text-muted-foreground text-sm">@{requester?.username}</p>
        </div>

        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl p-8 mb-8 text-white text-center">
          <p className="text-violet-100 text-sm mb-2">Amount Requested</p>
          <p className="text-6xl font-bold font-heading">${request.amount}</p>
          <p className="text-violet-100 text-sm mt-2">{request.currency}</p>
        </div>

        <div className="bg-secondary rounded-2xl p-4 mb-8">
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground text-xs uppercase font-semibold mb-1">
                For
              </p>
              <p className="font-medium">{request.recipientName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase font-semibold mb-1">
                Status
              </p>
              <p
                className={`font-medium ${
                  request.status === "paid" ? "text-green-500" : "text-yellow-500"
                }`}
              >
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {user ? (
          <div className="space-y-3">
            <Button
              onClick={handleConfirmPayment}
              disabled={request.status === "paid"}
              className="w-full h-14 text-lg rounded-xl shadow-lg shadow-violet-500/20 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-confirm-payment"
            >
              {request.status === "paid" ? "Already Paid" : "Confirm Payment"}
            </Button>
            <Link href="/">
              <Button
                variant="outline"
                className="w-full h-14 text-lg rounded-xl"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handleDownloadApp}
              className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center space-x-2"
              data-testid="button-download-app"
            >
              <Download size={20} />
              <span>Download BukkaPay</span>
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Download the app to accept this payment request
            </p>
            <Link href="/login">
              <Button
                variant="outline"
                className="w-full h-14 rounded-xl"
                data-testid="button-login"
              >
                Already have an account? Login
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
