import { cn } from "@/lib/utils";

export default function TransactionList({ transactions }: { transactions: any[] }) {

  return (
    <div className="space-y-4">
      {transactions.map((tx) => (
        <div key={tx.id} className="flex items-center justify-between group cursor-pointer">
          <div className="flex items-center space-x-4">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              "bg-secondary group-hover:bg-primary/10"
            )}>
              <tx.icon size={20} className={cn(
                "text-muted-foreground group-hover:text-primary",
                tx.type === 'income' && "text-green-600"
              )} />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground">{tx.title}</h4>
              <p className="text-xs text-muted-foreground">{tx.date} • {tx.category}</p>
            </div>
          </div>
          <div className={cn(
            "font-semibold text-sm",
            tx.type === 'income' ? "text-green-600" : "text-foreground"
          )}>
            {tx.type === 'income' ? '+' : ''}{tx.amount.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}
