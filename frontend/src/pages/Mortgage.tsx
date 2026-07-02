import { useState } from "react";
import { useMortgages, useCreateMortgage, useUpdateMortgage, useDeleteMortgage } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/utils";
import { forecastMortgage, annuityPayment } from "@/lib/mortgage";
import { useTranslation } from "react-i18next";
import type { Mortgage } from "@/types";

// ── Rate forecast (client-side): plan future rate changes over time ────────────
type ForecastRow = { month: string; rate: string; amort: string };

function parseSavedForecast(json?: string): ForecastRow[] {
  try {
    const arr = json ? JSON.parse(json) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => ({ month: String(r.month ?? ""), rate: String(r.rate ?? ""), amort: String(r.amort ?? "") }));
  } catch {
    return [];
  }
}

function RateForecast({ mortgage }: { mortgage: Mortgage }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateMortgage();
  const totalMonths = mortgage.amortizationYears * 12;

  // Starting fixed amortization: the manual value if set, otherwise the annuity's
  // initial principal portion (a sensible default the user can adjust below).
  const monthlyInterest0 = (mortgage.principalAmount * mortgage.interestRate) / 1200;
  const baseAmort = mortgage.monthlyPaymentOverride
    ?? Math.max(0, annuityPayment(mortgage.principalAmount, mortgage.interestRate, totalMonths) - monthlyInterest0);

  // Restore any saved forecast for this mortgage so it survives navigation/reload.
  const [changes, setChanges] = useState<ForecastRow[]>(() => parseSavedForecast(mortgage.forecast));
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(changes) !== (mortgage.forecast ?? "[]");

  function saveForecast() {
    update.mutate(
      { id: mortgage.id, forecast: JSON.stringify(changes) },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
    );
  }

  const parsed = changes
    .map((c) => ({
      month: parseInt(c.month),
      rate: c.rate ? parseFloat(c.rate) : undefined,
      amort: c.amort ? parseFloat(c.amort) : undefined,
    }))
    .filter((c) => c.month >= 1 && ((c.rate ?? 0) > 0 || (c.amort ?? 0) > 0));

  const f = forecastMortgage(mortgage.principalAmount, mortgage.interestRate, baseAmort, parsed);
  const current = f.periods[0]?.payment ?? 0;

  const ym = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toLocaleDateString(i18n.language, { year: "numeric", month: "short" });
  };
  const label = (m: number) => (m === 0 ? t("mortgage.now") : t("mortgage.inMonths", { n: m }));
  const dur = (m: number) => {
    if (m >= 2400) return "200+";
    const y = Math.floor(m / 12), mo = m % 12;
    return `${y} ${t("mortgage.yearsUnit")} ${mo} ${t("mortgage.monthsShort")}`;
  };

  const set = (i: number, patch: Partial<{ month: string; rate: string; amort: string }>) =>
    setChanges((cs) => cs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20 mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mortgage.forecastTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("mortgage.forecastHint")}</p>

      {/* Editable future changes — rate and/or amortization, effective from a month */}
      <div className="space-y-2">
        {changes.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.inMonthsLabel")}</label>
              <Input type="number" min="1" value={c.month} className="h-8 w-20"
                onChange={(e) => set(i, { month: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.newRate")}</label>
              <Input type="number" step="0.01" value={c.rate} className="h-8 w-24"
                placeholder={String(mortgage.interestRate)}
                onChange={(e) => set(i, { rate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("mortgage.forecastAmort")}</label>
              <Input type="number" step="100" value={c.amort} className="h-8 w-28"
                placeholder={String(Math.round(baseAmort))}
                onChange={(e) => set(i, { amort: e.target.value })} />
            </div>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => setChanges((cs) => cs.filter((_, j) => j !== i))}>
              {t("mortgage.remove")}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setChanges((cs) => [...cs, { month: "", rate: "", amort: "" }])}>
            + {t("mortgage.addChange")}
          </Button>
          <Button size="sm" onClick={saveForecast} disabled={update.isPending || !dirty}>
            {t("mortgage.saveForecast")}
          </Button>
          {saved && <span className="text-xs text-green-600">{t("mortgage.forecastSaved")}</span>}
        </div>
      </div>

      {parsed.length > 0 && (
        <>
          {/* Payment timeline: interest (moves with rate) + fixed amortization */}
          <div className="rounded-md border bg-background text-sm overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
              <span>{t("mortgage.when")}</span>
              <span className="text-right">{t("mortgage.rate")}</span>
              <span className="text-right">{t("mortgage.amortization")}</span>
              <span className="text-right">{t("mortgage.monthlyPayment")}</span>
              <span className="text-right">{t("mortgage.monthlyDelta")}</span>
            </div>
            {f.periods.map((p, i) => {
              const delta = p.payment - current;
              return (
                <div key={i} className="grid grid-cols-5 gap-2 px-3 py-1.5 border-b last:border-0">
                  <span className="text-muted-foreground truncate">{label(p.atMonth)} · {ym(p.atMonth)}</span>
                  <span className="text-right tabular-nums">{p.rate}%</span>
                  <span className="text-right tabular-nums">{fmt(p.amort)}</span>
                  <span className="text-right tabular-nums font-medium">{fmt(p.payment)}</span>
                  <span className={`text-right tabular-nums ${i === 0 ? "text-muted-foreground" : delta > 0 ? "text-red-600" : "text-green-600"}`}>
                    {i === 0 ? "—" : `${delta >= 0 ? "+" : ""}${fmt(delta)}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Lifetime comparison (useful when negotiating) */}
          <div className="rounded-md border divide-y bg-background text-sm">
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.payoffBaseline")}</span>
              <span className="tabular-nums">{dur(f.baselinePayoffMonths)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.payoffForecast")}</span>
              <span className="tabular-nums">{dur(f.payoffMonths)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeAtCurrent")}</span>
              <span className="tabular-nums">{fmt(f.baselineTotalInterest)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeForecast")}</span>
              <span className="tabular-nums">{fmt(f.forecastTotalInterest)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{t("mortgage.lifetimeDelta")}</span>
              <span className={`tabular-nums font-bold ${f.interestDelta > 0 ? "text-red-600" : "text-green-600"}`}>
                {f.interestDelta >= 0 ? "+" : ""}{fmt(f.interestDelta)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Single mortgage card ──────────────────────────────────────────────────────
function MortgageCard({ mortgage }: { mortgage: Mortgage }) {
  const update = useUpdateMortgage();
  const remove = useDeleteMortgage();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name:                   mortgage.name,
    principalAmount:        String(mortgage.principalAmount),
    interestRate:           String(mortgage.interestRate),
    amortizationYears:      String(mortgage.amortizationYears),
    monthlyPaymentOverride: mortgage.monthlyPaymentOverride ? String(mortgage.monthlyPaymentOverride) : "",
    effectiveFrom:          mortgage.effectiveFrom,
    notes:                  mortgage.notes ?? "",
  });

  function save() {
    update.mutate({
      id: mortgage.id,
      name:                   form.name,
      principalAmount:        parseFloat(form.principalAmount),
      interestRate:           parseFloat(form.interestRate),
      amortizationYears:      parseInt(form.amortizationYears),
      monthlyPaymentOverride: form.monthlyPaymentOverride ? parseFloat(form.monthlyPaymentOverride) : undefined,
      effectiveFrom:          form.effectiveFrom,
      notes:                  form.notes || undefined,
    });
    setEditing(false);
  }

  // Fixed-amortization view (same model as the forecast): the monthly payment is
  // interest on the balance + a fixed amortization. The amortization is the manual
  // value if set, otherwise the annuity's initial principal portion.
  const months        = mortgage.amortizationYears * 12;
  const interestMonth  = (mortgage.principalAmount * mortgage.interestRate) / 1200;
  const amortization   = mortgage.monthlyPaymentOverride
    ?? Math.max(0, annuityPayment(mortgage.principalAmount, mortgage.interestRate, months) - interestMonth);
  const monthlyPayment = interestMonth + amortization;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{mortgage.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{t("mortgage.effectiveFrom")}: {mortgage.effectiveFrom}</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{t("mortgage.edit")}</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
              onClick={() => window.confirm(t("mortgage.deleteConfirm")) && remove.mutate(mortgage.id)}>
              {t("mortgage.delete")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            {([
              ["name",                   t("mortgage.name"),      "text"],
              ["principalAmount",        t("mortgage.principal"), "number"],
              ["interestRate",           t("mortgage.rate"),      "number"],
              ["amortizationYears",      t("mortgage.years"),     "number"],
              ["monthlyPaymentOverride", t("mortgage.override"),  "number"],
              ["effectiveFrom",          t("mortgage.effectiveFrom"), "date"],
              ["notes",                  t("mortgage.notes"),     "text"],
            ] as const).map(([key, label, type]) => (
              <div key={key} className={`space-y-1 ${key === "notes" || key === "monthlyPaymentOverride" ? "col-span-2" : ""}`}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <Input type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="h-7 text-xs" />
              </div>
            ))}
            <div className="col-span-2 flex gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={update.isPending}>{t("mortgage.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("mortgage.cancel")}</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="rounded-md border divide-y text-sm">
              {[
                { label: t("mortgage.principal"),      value: fmt(mortgage.principalAmount) },
                { label: t("mortgage.currentRate"),    value: `${mortgage.interestRate}%` },
                { label: t("mortgage.years"),          value: `${mortgage.amortizationYears} ${t("mortgage.yearsUnit")}` },
                { label: t("mortgage.monthlyAmort"),   value: fmt(amortization) },
                { label: t("mortgage.interestPortion"), value: fmt(interestMonth) },
                { label: t("mortgage.monthlyPayment"), value: fmt(monthlyPayment), bold: true },
                { label: t("mortgage.annualTotal"),    value: fmt(monthlyPayment * 12), bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label} className="flex justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`tabular-nums ${bold ? "font-bold" : "font-medium"}`}>{value}</span>
                </div>
              ))}
            </div>
            {mortgage.notes && (
              <p className="text-xs text-muted-foreground italic">{mortgage.notes}</p>
            )}
            <RateForecast mortgage={mortgage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Add mortgage form ─────────────────────────────────────────────────────────
function AddMortgageForm({ onDone }: { onDone: () => void }) {
  const create = useCreateMortgage();
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name: "", principalAmount: "", interestRate: "",
    amortizationYears: "25", monthlyPaymentOverride: "",
    effectiveFrom: today, notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({
      name:                   form.name,
      principalAmount:        parseFloat(form.principalAmount),
      interestRate:           parseFloat(form.interestRate),
      amortizationYears:      parseInt(form.amortizationYears),
      monthlyPaymentOverride: form.monthlyPaymentOverride ? parseFloat(form.monthlyPaymentOverride) : undefined,
      effectiveFrom:          form.effectiveFrom,
      notes:                  form.notes || undefined,
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("mortgage.addMortgage")}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {([
            ["name",                   t("mortgage.name"),      "text",   "col-span-2"],
            ["principalAmount",        t("mortgage.principal"), "number", ""],
            ["interestRate",           t("mortgage.rate"),      "number", ""],
            ["amortizationYears",      t("mortgage.years"),     "number", ""],
            ["effectiveFrom",          t("mortgage.effectiveFrom"), "date", ""],
            ["monthlyPaymentOverride", t("mortgage.override"),  "number", "col-span-2"],
            ["notes",                  t("mortgage.notes"),     "text",   "col-span-2"],
          ] as const).map(([key, label, type, span]) => (
            <div key={key} className={`space-y-1 ${span}`}>
              <label className="text-xs text-muted-foreground">{label}</label>
              <Input type={type} value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required={["name", "principalAmount", "interestRate", "amortizationYears", "effectiveFrom"].includes(key)}
              />
            </div>
          ))}
          <div className="col-span-2 flex gap-2 pt-1">
            <Button type="submit" disabled={create.isPending}>{t("mortgage.save")}</Button>
            <Button type="button" variant="ghost" onClick={onDone}>{t("mortgage.cancel")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Mortgage() {
  const { data: mortgages, isLoading } = useMortgages();
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("mortgage.title")}</h1>
        {!showAdd && (
          <Button onClick={() => setShowAdd(true)}>{t("mortgage.addMortgage")}</Button>
        )}
      </div>

      {showAdd && <AddMortgageForm onDone={() => setShowAdd(false)} />}

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && (!mortgages || mortgages.length === 0) && !showAdd && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>{t("mortgage.noMortgages")}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {(mortgages ?? []).map((m) => <MortgageCard key={m.id} mortgage={m} />)}
      </div>
    </div>
  );
}
