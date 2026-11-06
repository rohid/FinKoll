import { Link } from "react-router-dom";
import { useDataHealth } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DataHealth } from "@/types";

// One data-quality issue card: a count, why it matters, where to fix it, and a few
// offending rows. Hidden entirely when the issue has no occurrences.
function IssueCard({
  count, title, desc, fixTo, fixLabel, children,
}: {
  count: number; title: string; desc: string; fixTo: string; fixLabel: string; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <span className="flex-1">{title}</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{desc}</p>
        <div className="space-y-1 text-sm">{children}</div>
        <Link to={fixTo} className="inline-block text-xs font-medium text-primary hover:underline">{fixLabel} →</Link>
      </CardContent>
    </Card>
  );
}

export function DataHealth() {
  const { t } = useTranslation();
  const { data, isLoading } = useDataHealth();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </div>
    );
  }
  if (!data) return null;

  const h: DataHealth = data;
  const more = (shown: number, total: number) =>
    total > shown ? <p className="text-xs text-muted-foreground">{t("dataHealth.andMore", { count: total - shown })}</p> : null;

  const row = (key: string | number, left: string, right?: string) => (
    <div key={key} className="flex items-center gap-3">
      <span className="flex-1 truncate">{left}</span>
      {right && <span className="tabular-nums text-muted-foreground">{right}</span>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-primary" size={22} />
        <h1 className="text-2xl font-bold">{t("dataHealth.title")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("dataHealth.subtitle")}</p>

      {h.totalIssues === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm">
            <ShieldCheck className="text-green-600" size={24} />
            <span className="font-medium">{t("dataHealth.allClear")}</span>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {t("dataHealth.issuesFound", { count: h.totalIssues })}
          </p>

          <IssueCard count={h.negativeAmounts.count} title={t("dataHealth.negTitle")} desc={t("dataHealth.negDesc")}
            fixTo="/monthly" fixLabel={t("dataHealth.fixInMonthly")}>
            {h.negativeAmounts.items.map((it) => row(it.id, `${it.date} · ${it.description} (${it.categoryName})`, fmt(it.amount)))}
            {more(h.negativeAmounts.items.length, h.negativeAmounts.count)}
          </IssueCard>

          <IssueCard count={h.ungroupedCategories.count} title={t("dataHealth.ungroupedTitle")} desc={t("dataHealth.ungroupedDesc")}
            fixTo="/settings" fixLabel={t("dataHealth.fixInSettings")}>
            {h.ungroupedCategories.items.map((it) => row(it.id, it.name, it.type))}
            {more(h.ungroupedCategories.items.length, h.ungroupedCategories.count)}
          </IssueCard>

          <IssueCard count={h.duplicateCategoryNames.count} title={t("dataHealth.dupTitle")} desc={t("dataHealth.dupDesc")}
            fixTo="/settings" fixLabel={t("dataHealth.fixInSettings")}>
            {h.duplicateCategoryNames.items.map((it) => row(it.name, it.name, t("dataHealth.nCopies", { count: it.ids.length })))}
            {more(h.duplicateCategoryNames.items.length, h.duplicateCategoryNames.count)}
          </IssueCard>

          <IssueCard count={h.splitMismatches.count} title={t("dataHealth.splitTitle")} desc={t("dataHealth.splitDesc")}
            fixTo="/monthly" fixLabel={t("dataHealth.fixInMonthly")}>
            {h.splitMismatches.items.map((it) => row(it.id, `${it.date} · ${it.description}`, `${fmt(it.itemsTotal)} ≠ ${fmt(it.amount)}`))}
            {more(h.splitMismatches.items.length, h.splitMismatches.count)}
          </IssueCard>

          <IssueCard count={h.housingUnassigned.count} title={t("dataHealth.housingTitle")} desc={t("dataHealth.housingDesc")}
            fixTo="/monthly" fixLabel={t("dataHealth.fixInMonthly")}>
            {h.housingUnassigned.items.map((it) => row(it.id, `${it.date} · ${it.description} (${it.categoryName})`))}
            {more(h.housingUnassigned.items.length, h.housingUnassigned.count)}
          </IssueCard>

          <IssueCard count={h.unusedCategories.count} title={t("dataHealth.unusedTitle")} desc={t("dataHealth.unusedDesc")}
            fixTo="/settings" fixLabel={t("dataHealth.fixInSettings")}>
            {h.unusedCategories.items.map((it) => row(it.id, it.name, it.type))}
            {more(h.unusedCategories.items.length, h.unusedCategories.count)}
          </IssueCard>
        </>
      )}
    </div>
  );
}
