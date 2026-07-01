import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  /** true = green · "warning" = orange · false = red · null = neutral */
  positive?: boolean | "warning" | null;
  className?: string;
}

export function KpiCard({ label, value, sub, positive, className }: KpiCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p
          className={cn(
            "mt-1 text-xl sm:text-2xl font-bold tabular-nums break-words",
            positive === true      && "text-green-600",
            positive === "warning" && "text-orange-500",
            positive === false     && "text-red-600"
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
