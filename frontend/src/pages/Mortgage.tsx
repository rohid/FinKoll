import { useState } from "react";
import { useMortgages, useCreateMortgage, useUpdateMortgage, useDeleteMortgage, useMortgageScenario } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { Mortgage } from "@/types";

// ── Rate scenario calculator ──────────────────────────────────────────────────
function ScenarioCalc({ mortgage }: { mortgage: Mortgage }) {
  const { t } = useTranslation();
  const [newRate, setNewRate] = useState("");
  const [triggered, setTriggered] = useState(false);

  const params = triggered && newRate
    ? { principal: mortgage.principalAmount, rate: parseFloat(newRate), years: mortgage.amortizationYears, baseRate: mortgage.interestRate }
    : null;

  const { data: scenario } = useMortgageScenario(params);

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20 mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mortgage.scenarioTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("mortgage.scenarioHint")}</p>
      <div className="flex gap-2 items-end">
        <div className="space-y-1 flex-1">
          <label className="text-xs text-muted-foreground">{t("mortgage.newRate")}</label>
          <Input type="number" step="0.01" placeholder={String(mortgage.interestRate)}
            value={newRate} onChange={(e) => { setNewRate(e.target.value); setTriggered(false); }} className="w-32" />
        </div>
        <Button size="sm" onClick={() => setTriggered(true)} disabled={!newRate}>
          {t("mortgage.calculate")}
        </Button>
      </div>

      {scenario && triggered && (
        <div className="rounded-md border divide-y bg-background text-sm">
          {[
            { label: t("mortgage.monthlyPayment"), value: fmt(scenario.monthlyPayment), bold: true },
            { label: t("mortgage.interestPortion"), value: fmt(scenario.interestPortion) },
            { label: t("mortgage.amortPortion"), value: fmt(scenario.amortPortion) },
            { label: t("mortgage.annualTotal"), value: fmt(scenario.annualTotal) },
            ...(scenario.monthlyDelta !== undefined ? [
              { label: t("mortgage.monthlyDelta"), value: `${scenario.monthlyDelta >= 0 ? "+" : ""}${fmt(scenario.monthlyDelta)}`, highlight: true },
              { label: t("mortgage.annualDelta"),  value: `${scenario.annualDelta! >= 0 ? "+" : ""}${fmt(scenario.annualDelta!)}`, highlight: true },
            ] : []),
          ].map(({ label, value, bold, highlight }) => (
            <div key={label} className="flex justify-between px-3 py-1.5">
              <span className="text-muted-foreground">{label}</span>
              <span className={`tabular-nums font-${bold ? "bold" : "medium"} ${highlight ? (scenario.monthlyDelta! > 0 ? "text-red-600" : "text-green-600") : ""}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
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

  const interestPortion = mortgage.principalAmount * (mortgage.interestRate / 100 / 12);
  const amortPortion    = mortgage.calculatedPayment - interestPortion;

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
                { label: t("mortgage.principal"),     value: fmt(mortgage.principalAmount) },
                { label: t("mortgage.currentRate"),   value: `${mortgage.interestRate}%` },
                { label: t("mortgage.years"),         value: `${mortgage.amortizationYears} ${t("mortgage.yearsUnit")}` },
                { label: t("mortgage.monthlyPayment"), value: fmt(mortgage.calculatedPayment), bold: true },
                { label: t("mortgage.interestPortion"), value: fmt(interestPortion) },
                { label: t("mortgage.amortPortion"),   value: fmt(Math.max(0, amortPortion)) },
                { label: t("mortgage.annualTotal"),    value: fmt(mortgage.calculatedPayment * 12), bold: true },
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
            <ScenarioCalc mortgage={mortgage} />
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
