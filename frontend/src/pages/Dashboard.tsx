import { useState } from "react";
import { useMonthlySummary, useAppSetting, useMonthInsights } from "@/api/hooks";
import { KpiCard } from "@/components/KpiCard";
import { BudgetTable } from "@/components/BudgetTable";
import { MonthSelector } from "@/components/MonthSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, fmtPct } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Info, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TemplateSignal, TrendObservation } from "@/types";

// ── Health score ring ─────────────────────────────────────────────────────────
function HealthScore({ score }: { score: number }) {
  const { t } = useTranslation();
  const label =
    score >= 85 ? t("insights.healthExcellent") :
    score >= 65 ? t("insights.healthGood") :
    score >= 45 ? t("insights.healthFair") :
                  t("insights.healthPoor");
  const color =
    score >= 85 ? "text-green-600" :
    score >= 65 ? "text-blue-600" :
    score >= 45 ? "text-amber-500" :
                  "text-red-600";
  const ring =
    score >= 85 ? "stroke-green-500" :
    score >= 65 ? "stroke-blue-500" :
    score >= 45 ? "stroke-amber-400" :
                  "stroke-red-500";

  const r = 30;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" className={ring} strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            transform="rotate(-90 40 40)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-lg font-bold tabular-nums", color)}>{score}</span>
        </div>
      </div>
      <div>
        <p className={cn("font-semibold", color)}>{label}</p>
        <p className="text-xs text-muted-foreground">{t("insights.health")}</p>
      </div>
    </div>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────
function SignalRow({ s }: { s: TemplateSignal }) {
  const { t } = useTranslation();
  const icon =
    s.signal === "overrun"      ? <AlertTriangle size={14} className="text-red-500 flex-shrink-0" /> :
    s.signal === "missing"      ? <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" /> :
    s.signal === "under_budget" ? <CheckCircle  size={14} className="text-green-500 flex-shrink-0" /> :
                                  <CheckCircle  size={14} className="text-blue-400 flex-shrink-0"  />;

  const text =
    s.signal === "overrun"
      ? t("insights.overrun",     { category: s.categoryName, actual: fmt(s.actualAmount), template: fmt(s.templateAmount), pct: Math.abs(Math.round(s.variancePct)) })
    : s.signal === "missing"
      ? t("insights.missing",     { category: s.categoryName, template: fmt(s.templateAmount) })
    : s.signal === "under_budget"
      ? t("insights.under_budget",{ category: s.categoryName, actual: fmt(s.actualAmount), template: fmt(s.templateAmount), saved: fmt(Math.abs(s.variance)) })
    : null;

  if (!text) return null;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0">
      {icon}
      <span className="text-xs">{text}</span>
    </div>
  );
}

// ── Observation row ───────────────────────────────────────────────────────────
function ObsRow({ obs }: { obs: TrendObservation }) {
  const { t } = useTranslation();
  const icon =
    obs.severity === "good"    ? <TrendingUp   size={14} className="text-green-500 flex-shrink-0" /> :
    obs.severity === "warning" ? <TrendingDown size={14} className="text-amber-500 flex-shrink-0" /> :
                                 <Info         size={14} className="text-blue-400 flex-shrink-0"  />;

  const key = `insights.${obs.type}`;
  const text = t(key, obs.data as Record<string, string>);

  return (
    <div className="flex items-start gap-2 py-1.5 border-b last:border-0">
      {icon}
      <span className="text-xs">{text}</span>
    </div>
  );
}

// ── Smart Insights card ───────────────────────────────────────────────────────
function InsightsCard({ year, month }: { year: number; month: number }) {
  const { t } = useTranslation();
  const { data: insights } = useMonthInsights(year, month);
  if (!insights) return null;

  const actionableSignals = insights.signals.filter((s) => s.signal !== "on_track");
  const hasAlerts = actionableSignals.length > 0;
  const hasObs    = insights.observations.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>{t("insights.title")}</CardTitle>
          <HealthScore score={insights.healthScore} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {t("insights.alerts")}
          </p>
          {!hasAlerts ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle size={14} className="text-green-500" />
              {t("insights.noAlerts")}
            </div>
          ) : (
            <div>{actionableSignals.map((s) => <SignalRow key={s.categoryId} s={s} />)}</div>
          )}
        </div>

        {/* Observations */}
        {hasObs && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {t("insights.observations")}
            </p>
            <div>{insights.observations.map((obs, i) => <ObsRow key={i} obs={obs} />)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function Dashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data: summary } = useMonthlySummary(year, month);
  const { data: targetSetting } = useAppSetting("net_target");
  const netTarget = targetSetting?.value ? parseFloat(targetSetting.value) : null;
  const { t } = useTranslation();

  const pieData = summary?.categories
    .filter((c) => c.type === "EXPENSE" && c.actualAmount > 0)
    .map((c) => ({ name: c.categoryName, value: c.actualAmount, color: c.color })) ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label={t("dashboard.totalIncome")}   value={fmt(summary?.totalIncome ?? 0)}   positive={true} />
        <KpiCard label={t("dashboard.totalExpenses")} value={fmt(summary?.totalExpenses ?? 0)} />
        <KpiCard label={t("dashboard.totalSavings")}  value={fmt(summary?.totalSavings ?? 0)} />
        <KpiCard
          label={t("dashboard.netResult")}
          value={fmt(summary?.netResult ?? 0)}
          positive={
            !summary ? null
            : summary.netResult < 0 ? false
            : netTarget !== null && summary.netResult < netTarget ? "warning"
            : true
          }
          sub={netTarget !== null ? t("dashboard.netResultTarget", { target: fmt(netTarget) }) : t("dashboard.netResultSub")}
        />
        <KpiCard
          label={t("dashboard.savingsRate")}
          value={fmtPct(summary?.savingsRate ?? 0)}
          positive={summary ? summary.savingsRate >= 10 : null}
          sub={t("dashboard.savingsRateSub")}
        />
      </div>

      {/* Smart Insights */}
      <InsightsCard year={year} month={month} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget vs Actual */}
        <div className="lg:col-span-2 space-y-4">
          {(["INCOME", "EXPENSE", "SAVINGS"] as const).map((type) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle>
                  {type === "INCOME" ? t("dashboard.income") : type === "EXPENSE" ? t("dashboard.expenses") : t("dashboard.savings")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetTable categories={summary?.categories ?? []} filterType={type} />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {pieData.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("dashboard.expenseBreakdown")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {/* Housing costs for the primary home (moved here from the Monthly view) */}
          {summary && summary.housingCategories.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-primary" />{t("housing.title")}</CardTitle>
                <span className="text-lg font-bold tabular-nums">{fmt(summary.housingTotal)}</span>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border divide-y text-sm">
                  {summary.housingCategories.map((h) => (
                    <div key={h.categoryId} className="flex items-center justify-between px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
                        {h.categoryName}
                      </span>
                      <span className="tabular-nums">{fmt(h.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
