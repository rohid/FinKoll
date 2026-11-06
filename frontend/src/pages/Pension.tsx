import { useState, Fragment } from "react";
import {
  usePension, useCreatePensionHolding, useUpdatePensionHolding,
  useDeletePensionHolding, useBulkAddPension, useInvestmentSummary,
  useHouses, useMortgages, useUpdateHouse, useUpdateMortgage,
} from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fmt } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { PensionHolding, PensionType, House, Mortgage } from "@/types";
import { Trash2, PiggyBank, Home } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const TYPES: PensionType[] = ["ALLMAN", "TJANSTE", "PRIVAT"];

// Parse Swedish-formatted numbers: "450 000" → 450000, "1.234,50" → 1234.5.
const num = (s: string) =>
  parseFloat(String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

function useTypeLabel() {
  const { t } = useTranslation();
  return (type: PensionType) => t(`pension.type${type[0] + type.slice(1).toLowerCase()}`);
}

// ── Home equity ──────────────────────────────────────────────────────────────
// Your stake in each property: (market value − the loan secured on it) × your
// ownership share. The loan tracked in FinKoll is the full joint loan, so the
// share scales the whole position. Only valued properties count toward net worth.
interface EquityRow { house: House; mortgage: number; own: number; equity: number; tracked: boolean }
function computeEquity(houses: House[], mortgages: Mortgage[]): { rows: EquityRow[]; total: number } {
  const rows = houses.map((house) => {
    const mortgage = mortgages.filter((m) => m.houseId === house.id).reduce((s, m) => s + m.principalAmount, 0);
    const own = house.ownershipPct ?? 100;
    const tracked = house.valuation != null;
    const equity = tracked ? ((house.valuation ?? 0) - mortgage) * (own / 100) : 0;
    return { house, mortgage, own, equity, tracked };
  });
  return { rows, total: rows.filter((r) => r.tracked).reduce((s, r) => s + r.equity, 0) };
}

// ── Net-worth KPIs ─────────────────────────────────────────────────────────────
function NetWorthKpis({ capital, investValue, homeEquity }: { capital: number; investValue: number; homeEquity: number }) {
  const { t } = useTranslation();
  const netWorth = capital + investValue + homeEquity;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("pension.totalCapital")}</p>
            <p className="font-medium tabular-nums text-lg">{fmt(capital)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("pension.investmentValue")}</p>
            <p className="font-medium tabular-nums text-lg">{fmt(investValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("pension.homeEquity")}</p>
            <p className="font-medium tabular-nums text-lg">{homeEquity !== 0 ? fmt(homeEquity) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("pension.netWorth")}</p>
            <p className="font-bold tabular-nums text-lg">{fmt(netWorth)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">{t("pension.netWorthHint")}</p>
      </CardContent>
    </Card>
  );
}

// ── Property & home equity ─────────────────────────────────────────────────────
function PropertyRow({ row }: { row: EquityRow }) {
  const { t } = useTranslation();
  const update = useUpdateHouse();
  const { house } = row;
  const [val, setVal] = useState(house.valuation != null ? String(house.valuation) : "");
  const [own, setOwn] = useState(String(house.ownershipPct ?? 100));

  const dirty = val !== (house.valuation != null ? String(house.valuation) : "") ||
    own !== String(house.ownershipPct ?? 100);

  function save() {
    update.mutate({
      id: house.id,
      valuation: val.trim() === "" ? null : (parseFloat(val) || 0),
      ownershipPct: Math.min(100, Math.max(0, parseFloat(own) || 0)),
    });
  }

  const shareOfValue = (parseFloat(val) || 0) * ((parseFloat(own) || 0) / 100);

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 text-sm">{house.name}</td>
      <td className="py-2 pr-3 text-right">
        <Input type="number" step="1000" value={val} onChange={(e) => setVal(e.target.value)}
          placeholder="—" className="h-7 text-xs w-32 text-right ml-auto" />
      </td>
      <td className="py-2 pr-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Input type="number" step="1" value={own} onChange={(e) => setOwn(e.target.value)}
            className="h-7 text-xs w-16 text-right" />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </td>
      <td className="py-2 pr-3 text-sm tabular-nums text-right text-muted-foreground">{row.mortgage > 0 ? fmt(row.mortgage) : "—"}</td>
      <td className="py-2 pr-3 text-sm tabular-nums text-right font-medium">
        {val.trim() === "" ? "—" : fmt((shareOfValue) - row.mortgage * ((parseFloat(own) || 0) / 100))}
      </td>
      <td className="py-2">
        {dirty && <Button size="sm" onClick={save} disabled={update.isPending}>{t("settings.save")}</Button>}
      </td>
    </tr>
  );
}

function LoanAssignRow({ m, houses }: { m: Mortgage; houses: House[] }) {
  const update = useUpdateMortgage();
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1">
      <span className="truncate">{m.name} <span className="text-muted-foreground tabular-nums">· {fmt(m.principalAmount)}</span></span>
      <Select
        value={m.houseId != null ? String(m.houseId) : ""}
        onChange={(e) => update.mutate({ id: m.id, houseId: e.target.value ? parseInt(e.target.value) : null })}
        className="h-7 text-xs w-40"
      >
        <option value="">{t("pension.unassigned")}</option>
        {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </Select>
    </div>
  );
}

function PropertySection({ houses, mortgages, equity }: { houses: House[]; mortgages: Mortgage[]; equity: EquityRow[] }) {
  const { t } = useTranslation();
  if (houses.length === 0) return null;
  const asOf = houses.map((h) => h.valuationAsOf).filter(Boolean).sort().slice(-1)[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Home size={17} className="text-primary" />{t("pension.property")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase">
                <th className="text-left py-2 pr-3 font-medium">{t("pension.propertyName")}</th>
                <th className="text-right py-2 pr-3 font-medium">{t("pension.valuation")}</th>
                <th className="text-right py-2 pr-3 font-medium">{t("pension.ownership")}</th>
                <th className="text-right py-2 pr-3 font-medium">{t("pension.mortgageBalance")}</th>
                <th className="text-right py-2 pr-3 font-medium">{t("pension.equity")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {equity.map((r) => <PropertyRow key={`${r.house.id}:${r.house.valuation ?? ""}:${r.house.ownershipPct}`} row={r} />)}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("pension.propertyHint")}{asOf ? ` · ${t("pension.valuationAsOf", { date: asOf })}` : ""}
        </p>

        {mortgages.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{t("pension.loans")}</p>
            <p className="text-xs text-muted-foreground mb-2">{t("pension.loansHint")}</p>
            <div className="divide-y">
              {mortgages.map((m) => <LoanAssignRow key={m.id} m={m} houses={houses} />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pension capital over time: current total + month-over-month movement ──────────
function MonthlyMovement({ history, currentTotal }: { history: { date: string; totalValueSek: number }[]; currentTotal: number }) {
  const { t } = useTranslation();
  // Last recorded value per calendar month, oldest → newest.
  const byMonth = new Map<string, number>();
  for (const s of [...history].sort((a, b) => a.date.localeCompare(b.date))) {
    byMonth.set(s.date.slice(0, 7), s.totalValueSek);
  }
  const months = [...byMonth.entries()].map(([month, value]) => ({ month, value }));
  const rows = months.map((m, i) => ({
    ...m,
    change: i > 0 ? m.value - months[i - 1].value : null,
    pct: i > 0 && months[i - 1].value !== 0 ? (m.value - months[i - 1].value) / months[i - 1].value * 100 : null,
  })).reverse(); // newest first

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{t("pension.monthlyMovement")}</CardTitle>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("pension.currentTotal")}</p>
            <p className="font-bold tabular-nums text-lg">{fmt(currentTotal)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length < 2 ? (
          <p className="text-sm text-muted-foreground">{t("pension.movementHint")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="text-left py-2 pr-3 font-medium">{t("pension.month")}</th>
                  <th className="text-right py-2 pr-3 font-medium">{t("pension.value")}</th>
                  <th className="text-right py-2 font-medium">{t("pension.change")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 tabular-nums">{r.month}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-right">{fmt(r.value)}</td>
                    <td className="py-1.5 tabular-nums text-right">
                      {r.change == null ? <span className="text-muted-foreground">—</span> : (
                        <span className={r.change > 0 ? "text-green-600" : r.change < 0 ? "text-red-600" : "text-muted-foreground"}>
                          {r.change >= 0 ? "+" : ""}{fmt(r.change)}
                          {r.pct != null && <span className="text-xs ml-1">({r.pct >= 0 ? "+" : ""}{r.pct.toFixed(1)}%)</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Value-over-time chart ────────────────────────────────────────────────────────
function HistoryChart({ history }: { history: { date: string; totalValueSek: number }[] }) {
  const { t } = useTranslation();
  if (history.length < 2) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("pension.valueOverTime")}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => fmt(v)} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Line type="monotone" dataKey="totalValueSek" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={t("pension.totalCapital")} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Editable holding row ─────────────────────────────────────────────────────────
function HoldingRow({ h }: { h: PensionHolding }) {
  const update = useUpdatePensionHolding();
  const remove = useDeletePensionHolding();
  const { t } = useTranslation();
  const typeLabel = useTypeLabel();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(h.name);
  const [type, setType] = useState<PensionType>(h.type);
  const [manager, setManager] = useState(h.manager ?? "");
  const [value, setValue] = useState(String(h.currentValue));
  const [payout, setPayout] = useState(h.projectedMonthlyPayout != null ? String(h.projectedMonthlyPayout) : "");

  function open() {
    setName(h.name); setType(h.type); setManager(h.manager ?? "");
    setValue(String(h.currentValue));
    setPayout(h.projectedMonthlyPayout != null ? String(h.projectedMonthlyPayout) : "");
    setEditing(true);
  }
  function save() {
    update.mutate({
      id: h.id, name, type, manager: manager.trim() || null,
      currentValue: parseFloat(value) || 0,
      projectedMonthlyPayout: payout.trim() ? parseFloat(payout) : null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-b last:border-0 bg-muted/20">
        <td className="py-2 pr-3"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs w-full" /></td>
        <td className="py-2 pr-3">
          <Select value={type} onChange={(e) => setType(e.target.value as PensionType)} className="h-7 text-xs w-32">
            {TYPES.map((ty) => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
          </Select>
        </td>
        <td className="py-2 pr-3"><Input value={manager} onChange={(e) => setManager(e.target.value)} className="h-7 text-xs w-28" placeholder={t("pension.manager")} /></td>
        <td className="py-2 pr-3 text-right"><Input type="number" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 text-xs w-28" /></td>
        <td className="py-2 pr-3 text-right"><Input type="number" step="1" value={payout} onChange={(e) => setPayout(e.target.value)} className="h-7 text-xs w-24" placeholder="—" /></td>
        <td className="py-2">
          <div className="flex gap-1">
            <Button size="sm" onClick={save} disabled={update.isPending}>{t("settings.save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("settings.cancel")}</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 text-sm">{h.name}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{typeLabel(h.type)}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{h.manager ?? "—"}</td>
      <td className="py-2 pr-3 text-sm tabular-nums text-right">{fmt(h.currentValue)}</td>
      <td className="py-2 pr-3 text-sm tabular-nums text-right text-muted-foreground">{h.projectedMonthlyPayout != null ? fmt(h.projectedMonthlyPayout) : "—"}</td>
      <td className="py-2">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={open}>{t("settings.edit")}</Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"
            onClick={() => window.confirm(t("pension.deleteConfirm")) && remove.mutate(h.id)}>
            <Trash2 size={13} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Add a single holding ─────────────────────────────────────────────────────────
function AddHoldingForm() {
  const create = useCreatePensionHolding();
  const { t } = useTranslation();
  const typeLabel = useTypeLabel();
  const [name, setName] = useState("");
  const [type, setType] = useState<PensionType>("TJANSTE");
  const [manager, setManager] = useState("");
  const [value, setValue] = useState("");
  const [payout, setPayout] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(), type, manager: manager.trim() || null,
      currentValue: parseFloat(value) || 0,
      projectedMonthlyPayout: payout.trim() ? parseFloat(payout) : null,
    });
    setName(""); setManager(""); setValue(""); setPayout("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 flex-wrap items-end">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("pension.name")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("pension.typeLabel")}</label>
        <Select value={type} onChange={(e) => setType(e.target.value as PensionType)} className="w-36">
          {TYPES.map((ty) => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("pension.manager")}</label>
        <Input value={manager} onChange={(e) => setManager(e.target.value)} className="w-28" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("pension.value")}</label>
        <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-28" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("pension.payoutShort")}</label>
        <Input type="number" value={payout} onChange={(e) => setPayout(e.target.value)} className="w-24" placeholder="—" />
      </div>
      <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.add")}</Button>
    </form>
  );
}

// ── Bulk paste from minpension ───────────────────────────────────────────────────
function BulkPaste() {
  const bulk = useBulkAddPension();
  const { t } = useTranslation();
  const typeLabel = useTypeLabel();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PensionType>("TJANSTE");
  const [text, setText] = useState("");

  const parsed = text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|;|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { name: parts[0], type, currentValue: num(parts[1]), projectedMonthlyPayout: parts[2] != null ? num(parts[2]) : undefined };
    }
    const m = line.match(/^(.*?)\s+([\d\s.,]+)$/);
    return m ? { name: m[1].trim(), type, currentValue: num(m[2]) } : null;
  }).filter((x): x is { name: string; type: PensionType; currentValue: number; projectedMonthlyPayout?: number } => !!x && x.name.length > 0);

  async function add() {
    if (parsed.length === 0) return;
    await bulk.mutateAsync(parsed);
    setText(""); setOpen(false);
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("pension.pasteButton")}</Button>;
  }
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">{t("pension.pasteHint")}</p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">{t("pension.typeLabel")}</label>
        <Select value={type} onChange={(e) => setType(e.target.value as PensionType)} className="h-7 text-xs w-36">
          {TYPES.map((ty) => <option key={ty} value={ty}>{typeLabel(ty)}</option>)}
        </Select>
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder={"Alecta ITP2\t450000\nAMF Tjänstepension\t220000"}
        className="w-full rounded-md border bg-background p-2 text-xs font-mono"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={add} disabled={parsed.length === 0 || bulk.isPending}>
          {t("pension.pasteAdd", { count: parsed.length })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setText(""); setOpen(false); }}>{t("settings.cancel")}</Button>
      </div>
    </div>
  );
}

export function Pension() {
  const { data } = usePension();
  const { data: inv } = useInvestmentSummary();
  const { data: houses } = useHouses();
  const { data: mortgages } = useMortgages();
  const { t } = useTranslation();
  const typeLabel = useTypeLabel();

  const holdings = data?.holdings ?? [];
  const summary = data?.summary;
  const investValue = inv?.totalValueSek ?? 0;
  const equity = computeEquity(houses ?? [], mortgages ?? []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <PiggyBank className="text-primary" size={22} />
        <h1 className="text-2xl font-bold">{t("pension.title")}</h1>
      </div>

      <NetWorthKpis capital={summary?.totalCapital ?? 0} investValue={investValue} homeEquity={equity.total} />

      <PropertySection houses={houses ?? []} mortgages={mortgages ?? []} equity={equity.rows} />

      <MonthlyMovement history={data?.history ?? []} currentTotal={summary?.totalCapital ?? 0} />

      {data && <HistoryChart history={data.history} />}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("pension.holdings")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pension.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-3 font-medium">{t("pension.name")}</th>
                    <th className="text-left py-2 pr-3 font-medium">{t("pension.typeLabel")}</th>
                    <th className="text-left py-2 pr-3 font-medium">{t("pension.manager")}</th>
                    <th className="text-right py-2 pr-3 font-medium">{t("pension.value")}</th>
                    <th className="text-right py-2 pr-3 font-medium">{t("pension.payoutShort")}</th>
                    <th className="text-left py-2 font-medium">{t("settings.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {TYPES.filter((ty) => holdings.some((h) => h.type === ty)).map((ty) => {
                    const group = holdings.filter((h) => h.type === ty);
                    const sub = summary?.byType.find((b) => b.type === ty);
                    return (
                      <Fragment key={ty}>
                        <tr className="bg-muted/30">
                          <td colSpan={3} className="py-1.5 pr-3 text-xs font-semibold uppercase tracking-wide">{typeLabel(ty)}</td>
                          <td className="py-1.5 pr-3 text-xs font-semibold tabular-nums text-right">{fmt(sub?.total ?? 0)}</td>
                          <td className="py-1.5 pr-3 text-xs font-semibold tabular-nums text-right text-muted-foreground">{sub && sub.payout > 0 ? fmt(sub.payout) : "—"}</td>
                          <td />
                        </tr>
                        {group.map((h) => <HoldingRow key={h.id} h={h} />)}
                      </Fragment>
                    );
                  })}
                  <tr className="border-t-2">
                    <td colSpan={3} className="py-2 pr-3 text-sm font-bold">{t("pension.totalCapital")}</td>
                    <td className="py-2 pr-3 text-sm font-bold tabular-nums text-right">{fmt(summary?.totalCapital ?? 0)}</td>
                    <td className="py-2 pr-3 text-sm font-bold tabular-nums text-right">{summary && summary.totalProjectedPayout > 0 ? fmt(summary.totalProjectedPayout) : "—"}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="pt-2 border-t space-y-3">
            <BulkPaste />
            <div>
              <p className="text-sm font-medium mb-3">{t("pension.addHolding")}</p>
              <AddHoldingForm />
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("pension.futureHint")}</p>
    </div>
  );
}
