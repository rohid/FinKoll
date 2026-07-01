import type { CategorySummary } from "@/types";
import { fmt, fmtPct } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface BudgetTableProps {
  categories: CategorySummary[];
  filterType?: "INCOME" | "EXPENSE" | "SAVINGS";
}

export function BudgetTable({ categories, filterType }: BudgetTableProps) {
  const { t } = useTranslation();
  const rows = filterType ? categories.filter((c) => c.type === filterType) : categories;

  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4">{t("budgetTable.noData")}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase">
            <th className="text-left py-2 pr-4 font-medium">{t("budgetTable.category")}</th>
            <th className="text-right py-2 px-2 font-medium">{t("budgetTable.planned")}</th>
            <th className="text-right py-2 px-2 font-medium">{t("budgetTable.actual")}</th>
            <th className="text-right py-2 px-2 font-medium">{t("budgetTable.variance")}</th>
            <th className="text-right py-2 pl-2 font-medium">{t("budgetTable.pctOfIncome")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.categoryId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  {row.categoryName}
                </div>
              </td>
              <td className="text-right py-2 px-2 tabular-nums text-muted-foreground">
                {fmt(row.plannedAmount)}
              </td>
              <td className="text-right py-2 px-2 tabular-nums font-medium">{fmt(row.actualAmount)}</td>
              <td
                className={cn(
                  "text-right py-2 px-2 tabular-nums",
                  row.variance > 0 && row.type === "EXPENSE" && "text-red-600",
                  row.variance > 0 && row.type !== "EXPENSE" && "text-green-600",
                  row.variance < 0 && row.type === "EXPENSE" && "text-green-600",
                  row.variance < 0 && row.type !== "EXPENSE" && "text-red-600"
                )}
              >
                {row.variance >= 0 ? "+" : ""}
                {fmt(row.variance)}
              </td>
              <td className="text-right py-2 pl-2 tabular-nums text-muted-foreground">
                {fmtPct(row.percentOfIncome)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
