import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WalletCard from "@/components/WalletCard";
import TransactionList from "@/components/TransactionList";
import ActionButtons from "@/components/ActionButtons";
import BottomNav from "@/components/BottomNav";
import { Bell, Search, Database } from "lucide-react";
import logoUrl from "@assets/file_000000000540722fb204f238188c2387_1764495081777.png";
import { fetchCards, fetchTransactions } from "@/lib/api";
import { mapCardFromAPI, mapTransactionFromAPI } from "@/lib/mappers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", 3],
    queryFn: () => fetchTransactions(3),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Success", description: "Sample data added!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add sample data", variant: "destructive" });
    },
  });

  const mainCard = cards && cards.length > 0 ? mapCardFromAPI(cards[0]) : null;
  const mappedTransactions = transactions?.map(mapTransactionFromAPI) || [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex justify-between items-center bg-background sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <img src={logoUrl} alt="BukkaPay Logo" className="w-10 h-10 rounded-xl object-contain" />
          <div>
            <p className="text-xs text-muted-foreground">Welcome back,</p>
            <h1 className="font-heading font-bold text-xl">Alex Morgan</h1>
          </div>
        </div>
        <div className="flex space-x-3">
          <button className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" data-testid="button-search">
            <Search size={20} />
          </button>
          <button className="relative w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" data-testid="button-notifications">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
          </button>
        </div>
      </header>

      <div className="px-6 space-y-8">
        <section>
          {cardsLoading && <div className="h-48 rounded-2xl bg-secondary animate-pulse" />}
          {mainCard && <WalletCard {...mainCard} className="shadow-primary/20 shadow-2xl" />}
          {!cardsLoading && !mainCard && (
            <div className="text-center py-12 space-y-4">
              <div className="text-muted-foreground">No cards yet. Add sample data to get started!</div>
              <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                <Database className="mr-2 h-4 w-4" />
                {seedMutation.isPending ? "Adding..." : "Add Sample Data"}
              </Button>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
          <ActionButtons />
        </section>

        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-bold">Recent Activity</h2>
            <button className="text-sm text-primary font-medium hover:underline" data-testid="button-see-all-transactions">See All</button>
          </div>
          {txLoading && <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)}
          </div>}
          {!txLoading && mappedTransactions.length > 0 && <TransactionList transactions={mappedTransactions} />}
          {!txLoading && mappedTransactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet</div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
