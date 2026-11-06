import { useState } from "react";
import { useTrends, useForecast, useSavingsBreakdown, useElectricityYearly, useYearlySummary } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, fmtPct, fmtKwh } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { useTranslation } from "react-i18next";

// ── Forecast section (current year only) ──────────────────────────────────────
function ForecastSection({ year }: { year: number }) {
  const { t } = useTranslation();
  const months = t("months", { returnObjects: true }) as string[];
  const { data, isLoading } = useForecast(year);

  if (isLoading) return <p className="text-muted-foreground text-sm">{t("analytics.loading")}</p>;
  if (!data) return null;

  // Build chart data: actual and forecast as separate keys on the same points
  // so Recharts can style them independently
  const chartData = data.months.map((m) => ({
    name: months[m.month - 1],
    // Actual values: only for non-forecast months
    income:   !m.isForecast ? m.income   : null,
    expenses: !m.isForecast ? m.expenses : null,
    savings:  !m.isForecast ? m.savings  : null,
    net:      !m.isForecast ? m.net      : null,
    savingsRate: !m.isForecast ? m.savingsRate : null,
    // Forecast values: only for forecast months + bridge the last actual month
    fIncome:   m.isForecast ? m.income   : null,
    fExpenses: m.isForecast ? m.expenses : null,
    fSavings:  m.isForecast ? m.savings  : null,
    fNet:      m.isForecast ? m.net      : null,
    fSavingsRate: m.isForecast ? m.savingsRate : null,
    isForecast: m.isForecast,
  }));

  // Add bridge: the last actual month also gets forecast values so lines connect
  const lastActualIdx = data.currentMonth - 1; // 0-based index
  if (lastActualIdx >= 0 && lastActualIdx < chartData.length) {
    const bridge = data.months[lastActualIdx];
    chartData[lastActualIdx].fIncome      = bridge.income;
    chartData[lastActualIdx].fExpenses    = bridge.expenses;
    chartData[lastActualIdx].fSavings     = bridge.savings;
    chartData[lastActualIdx].fNet         = bridge.net;
    chartData[lastActualIdx].fSavingsRate = bridge.savingsRate;
  }

  // Name of the current month for the reference line
  const todayLabel = months[data.currentMonth - 1];

  const hasForecast = data.months.some((m) => m.isForecast);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {t("analytics.forecastTitle", { year })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("analytics.forecastBasis")}</p>
        </div>
      </div>

      {/* Income · Expenses · Savings bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.incomeExpensesSavings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => v !== null ? fmt(v as number) : "—"} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              {hasForecast && (
                <ReferenceLine
                  x={todayLabel}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 2"
                  label={{ value: t("analytics.forecastToday"), position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
              )}
              {/* Actuals */}
              <Bar dataKey="income"   name={`${t("analytics.income")} (${t("analytics.forecastActual")})`}   fill="#22c55e" radius={[2,2,0,0]} />
              <Bar dataKey="expenses" name={`${t("analytics.expenses")} (${t("analytics.forecastActual")})`} fill="#ef4444" radius={[2,2,0,0]} />
              <Bar dataKey="savings"  name={`${t("analytics.savings")} (${t("analytics.forecastActual")})`}  fill="#3b82f6" radius={[2,2,0,0]} />
              {/* Forecast — lighter opacity */}
              {hasForecast && <>
                <Bar dataKey="fIncome"   name={`${t("analytics.income")} (${t("analytics.forecastProjected")})`}   fill="#22c55e" fillOpacity={0.35} radius={[2,2,0,0]} />
                <Bar dataKey="fExpenses" name={`${t("analytics.expenses")} (${t("analytics.forecastProjected")})`} fill="#ef4444" fillOpacity={0.35} radius={[2,2,0,0]} />
                <Bar dataKey="fSavings"  name={`${t("analytics.savings")} (${t("analytics.forecastProjected")})`}  fill="#3b82f6" fillOpacity={0.35} radius={[2,2,0,0]} />
              </>}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Net Result line chart */}
      <Card>
        <CardHeader><CardTitle>{t("analytics.netResultTrend")}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => v !== null ? fmt(v as number) : "—"} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              {hasForecast && (
                <ReferenceLine x={todayLabel} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
              )}
              <Line type="monotone" dataKey="net"  name={`${t("analytics.netResult")} (${t("analytics.forecastActual")})`}
                stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              {hasForecast && (
                <Line type="monotone" dataKey="fNet" name={`${t("analytics.netResult")} (${t("analytics.forecastProjected")})`}
                  stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} opacity={0.5} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Savings rate line chart */}
      <Card>
        <CardHeader><CardTitle>{t("analytics.savingsRatePct")}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => v !== null ? `${v}%` : "—"} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              {hasForecast && (
                <ReferenceLine x={todayLabel} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
              )}
              <Line type="monotone" dataKey="savingsRate"  name={`${t("analytics.savingsRate")} (${t("analytics.forecastActual")})`}
                stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              {hasForecast && (
                <Line type="monotone" dataKey="fSavingsRate" name={`${t("analytics.savingsRate")} (${t("analytics.forecastProjected")})`}
                  stroke="#06b6d4" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} opacity={0.5} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Module 2: Savings Breakdown ───────────────────────────────────────────────
function SavingsSection({ year }: { year: number }) {
  const { t } = useTranslation();
  const months = t("months", { returnObjects: true }) as string[];
  const { data, isLoading } = useSavingsBreakdown(year);

  if (isLoading) return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  if (!data || data.ytdByCat.length === 0) return null;

  // Donut data
  const donut = data.ytdByCat.map((c) => ({ name: c.categoryName, value: c.amount, color: c.color }));

  // Cumulative area chart data
  const areaData = data.monthly.map((m) => {
    const row: Record<string, number | string> = { name: months[m.month - 1] };
    let running = 0;
    for (const cat of data.ytdByCat) {
      running += m.byCat[cat.categoryId] ?? 0;
      row[cat.categoryName] = running;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("savings.title")}</h2>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("savings.ytdTotal"),   value: fmt(data.ytdTotal) },
          { label: t("savings.avgMonthly"), value: fmt(data.avgMonthly) },
          { label: t("savings.projected"),  value: fmt(data.projectedTotal) },
          { label: t("savings.emergency"),  value: t("savings.emergencyMonths", { months: data.monthsOfEmergencyFund }) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut — allocation */}
        <Card>
          <CardHeader><CardTitle>{t("savings.allocation")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={2}>
                  {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cumulative area chart */}
        <Card>
          <CardHeader><CardTitle>{t("savings.cumulativeTitle")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                {data.ytdByCat.map((cat) => (
                  <Area key={cat.categoryId} type="monotone" dataKey={cat.categoryName}
                    stroke={cat.color} fill={cat.color} fillOpacity={0.3} stackId="1" />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Spending-by-group section (canonical taxonomy rollup) ─────────────────────
function GroupSection({ year }: { year: number }) {
  const { t } = useTranslation();
  const { data } = useYearlySummary(year);
  if (!data) return null;

  const expenseGroups = data.groupRows.filter((g) => g.type === "EXPENSE" && g.total > 0);
  if (expenseGroups.length === 0) return null;

  const totalExpenses = expenseGroups.reduce((s, g) => s + g.total, 0);
  const donut = expenseGroups.map((g) => ({ name: g.groupName, value: g.total, color: g.color }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("analytics.spendByGroup")} · {year}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>{t("analytics.spendByGroup")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} paddingAngle={2}>
                  {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("analytics.groupRanking")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {expenseGroups.map((g) => (
              <div key={g.groupName} className="flex items-center gap-3 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="flex-1 truncate">{g.groupName}</span>
                <span className="tabular-nums font-medium">{fmt(g.total)}</span>
                <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">
                  {totalExpenses > 0 ? `${Math.round((g.total / totalExpenses) * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Electricity section ───────────────────────────────────────────────────────
function ElectricitySection({ year }: { year: number }) {
  const { t } = useTranslation();
  const months = t("months", { returnObjects: true }) as string[];
  const { data, isLoading } = useElectricityYearly(year);

  if (isLoading) return <p className="text-muted-foreground text-sm">{t("analytics.loading")}</p>;
  // Hide entirely when there's no electricity data for the year.
  if (!data || data.totals.totalBill <= 0) return null;

  const chartData = data.months.map((m) => ({
    name: months[m.month - 1],
    tibber: m.tibber,
    grid: m.grid,
    ev: m.evTotal,
    kwh: m.totalKwh,
    evKwh: m.evKwh,
  }));

  const monthsWithData = data.months.filter((m) => m.totalBill > 0).length || 1;
  const avgMonthly = data.totals.totalBill / monthsWithData;

  const TIBBER = "#f59e0b", VATTENFALL = "#3b82f6", CAR = "#8b5cf6", KWH = "#06b6d4";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("analytics.elecTitle")} · {year}</h2>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("analytics.elecTotalBillYtd"), value: fmt(data.totals.totalBill) },
          { label: t("analytics.elecAvgMonthly"),   value: fmt(avgMonthly) },
          { label: t("analytics.elecTotalKwhYtd"),  value: fmtKwh(data.totals.totalKwh) },
          { label: t("analytics.elecTotalEvCost"),  value: fmt(data.totals.evTotal) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly cost by source: Tibber + Vattenfall stacked, EV as a line */}
        <Card>
          <CardHeader><CardTitle>{t("analytics.elecMonthlyCost")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tibber" name={t("electricity.secTibber")}     stackId="c" fill={TIBBER} radius={[0, 0, 0, 0]} />
                <Bar dataKey="grid"   name={t("electricity.secVattenfall")} stackId="c" fill={VATTENFALL} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="ev" name={t("analytics.elecOfWhichCar")} stroke={CAR} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly consumption: total kWh bar + EV kWh line */}
        <Card>
          <CardHeader><CardTitle>{t("analytics.elecConsumption")}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtKwh(v as number)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="kwh"    name={t("analytics.elecTotalConsumption")} fill={KWH} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="evKwh" name={t("analytics.elecCarConsumption")} stroke={CAR} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Historical trends section ─────────────────────────────────────────────────
export function Analytics() {
  const currentYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState(currentYear - 1);
  const [toYear] = useState(currentYear);
  const { t } = useTranslation();

  const { data: trends, isLoading } = useTrends(fromYear, toYear);
  const months = t("months", { returnObjects: true }) as string[];

  const indexed = (trends ?? []).map(
    (entry: any, i: number) => ({
      name: `${months[i % 12]} '${String(entry.year).slice(2)}`,
      income: entry.summary.totalIncome,
      expenses: entry.summary.totalExpenses,
      savings: entry.summary.totalSavings,
      net: entry.summary.netResult,
      savingsRate: parseFloat(entry.summary.savingsRate.toFixed(1)),
    })
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("analytics.title")}</h1>
      </div>

      {/* ── Current year: actuals + forecast ─────────────────────────────── */}
      <ForecastSection year={currentYear} />

      {/* ── Spending by group (canonical taxonomy) ───────────────────────── */}
      <GroupSection year={currentYear} />

      {/* ── Module 2: Savings breakdown ───────────────────────────────────── */}
      <SavingsSection year={currentYear} />

      {/* ── Electricity ───────────────────────────────────────────────────── */}
      <ElectricitySection year={currentYear} />

      {/* ── Historical trends ────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">{t("analytics.incomeExpensesSavings")}</h2>
          <div className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-muted-foreground">{t("analytics.from")}</span>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={fromYear}
              onChange={(e) => setFromYear(parseInt(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => currentYear - 4 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-muted-foreground">{t("analytics.to")} {toYear}</span>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("analytics.loading")}</p>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={indexed} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income"   name={t("analytics.income")}   fill="#22c55e" radius={[2,2,0,0]} />
                    <Bar dataKey="expenses" name={t("analytics.expenses")} fill="#ef4444" radius={[2,2,0,0]} />
                    <Bar dataKey="savings"  name={t("analytics.savings")}  fill="#3b82f6" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("analytics.netResultTrend")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={indexed} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Line type="monotone" dataKey="net" name={t("analytics.netResult")}
                      stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("analytics.savingsRatePct")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={indexed} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="savingsRate" name={t("analytics.savingsRate")}
                      stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
