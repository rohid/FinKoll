import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "income" | "expense" | "savings";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "income"    && "bg-green-100 text-green-800",
        variant === "expense"   && "bg-red-100 text-red-800",
        variant === "savings"   && "bg-blue-100 text-blue-800",
        variant === "default"   && "bg-primary text-primary-foreground",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "outline"   && "border border-border text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
