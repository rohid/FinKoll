import { useState, useEffect } from "react";
import {
  useHouses, useElectricity, useUpsertElectricity,
  useElectricitySettings, useUpdateElectricitySettings,
  useCreateHouse, useRenameHouse, useDeleteHouse,
} from "@/api/hooks";
import { MonthSelector } from "@/components/MonthSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/KpiCard";
import { fmt, fmtKwh, cn } from "@/lib/utils";
import { Settings as SettingsIcon, ChevronDown, Check, Pencil, Trash2, Plus, X } from "lucide-react";
import type { ElectricityReading, ElectricitySettings, ElectricityRates } from "@/types";
import { useTranslation } from "react-i18next";

const ZERO_RATES: ElectricityRates = { transferRatePerKwh: 0, energyTaxPerKwh: 0 };

function ratesForHouse(s: ElectricitySettings, houseId: number): ElectricityRates {
  if (s.shared) return s.global;
  return s.perHouse[String(houseId)] ?? s.global ?? ZERO_RATES;
}

// ── Number input helpers ──────────────────────────────────────────────────────
// Tolerant parse so pasted/typed values like "1 234,56" or "0,45" work.
function parseNum(raw: string): number {
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

// A text input (not type=number) with a string buffer: this lets you paste any
// format and type decimals ("0,45", "1.") without the value being reformatted
// out from under the cursor. The buffer only re-syncs from `value` when it
// changes externally (e.g. switching month), never mid-edit.
function NumField({
  label, value, onChange, suffix, required, readOnly,
}: {
  label: string; value: number; onChange?: (v: number) => void;
  suffix?: string; required?: boolean; readOnly?: boolean;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => {
    if (parseNum(text) !== value) setText(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const empty = required && !text;
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
        {suffix && <span className="text-muted-foreground/60">({suffix})</span>}
      </label>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={readOnly}
        onChange={(e) => { setText(e.target.value); onChange?.(parseNum(e.target.value)); }}
        className={cn(
          readOnly && "bg-muted/40 text-muted-foreground",
          empty && "border-amber-400 focus-visible:ring-amber-400",
        )}
      />
    </div>
  );
}

// Hoisted to module scope (NOT defined inside a parent) so it isn't recreated on
// every render — that recreation is what was unmounting the inputs and stealing
// focus after each keystroke.
function RateRow({ rates, onChange }: { rates: ElectricityRates; onChange: (r: ElectricityRates) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumField label={t("electricity.transferRate")} value={rates.transferRatePerKwh}
        onChange={(v) => onChange({ ...rates, transferRatePerKwh: v })} />
      <NumField label={t("electricity.energyTax")} value={rates.energyTaxPerKwh}
        onChange={(v) => onChange({ ...rates, energyTaxPerKwh: v })} />
    </div>
  );
}

function CalcRow({ label, value, bold, sub, accent }: { label: string; value: string; bold?: boolean; sub?: boolean; accent?: boolean }) {
  return (
    <div className={cn(
      "flex justify-between py-1 text-sm",
      bold && "font-semibold border-t mt-1 pt-2",
      sub && "font-medium border-t border-dashed border-muted-foreground/30 mt-0.5 pt-1.5",
      accent && "text-primary",
    )}>
      <span className={cn(!bold && !sub && "text-muted-foreground")}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// Group header inside the breakdown card (Tibber / Vattenfall / Car).
function CalcSection({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 mt-3 first:mt-0">{label}</p>
  );
}

// ── Rates & VAT settings panel (per-house or shared) ──────────────────────────
function RatesSettings({ settings, houses }: { settings: ElectricitySettings; houses: { id: number; name: string }[] }) {
  const { t } = useTranslation();
  const update = useUpdateElectricitySettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ElectricitySettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  function setRates(houseId: number | "global", next: ElectricityRates) {
    setDraft((d) =>
      houseId === "global"
        ? { ...d, global: next }
        : { ...d, perHouse: { ...d.perHouse, [String(houseId)]: next } },
    );
  }
  const getRates = (houseId: number): ElectricityRates => draft.perHouse[String(houseId)] ?? draft.global ?? ZERO_RATES;

  function save() {
    update.mutate(draft, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <SettingsIcon size={16} className="text-muted-foreground" />
          {t("electricity.ratesSettings")}
        </span>
        <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <CardContent className="space-y-5 pt-0">
          <p className="text-xs text-muted-foreground">{t("electricity.ratesHint")}</p>

          {/* VAT + shared toggle */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-32">
              <NumField label={t("electricity.vatPct")} suffix="%" value={draft.vatPct}
                onChange={(v) => setDraft((d) => ({ ...d, vatPct: v }))} />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <input type="checkbox" checked={draft.shared}
                onChange={(e) => setDraft((d) => ({ ...d, shared: e.target.checked }))} />
              {t("electricity.sharedRates")}
            </label>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <input type="checkbox" checked={draft.sharedSubscription}
                onChange={(e) => setDraft((d) => ({ ...d, sharedSubscription: e.target.checked }))} />
              {t("electricity.sharedSubscription")}
            </label>
          </div>

          {/* Rate sets */}
          {draft.shared ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("electricity.allHouses")}</p>
              <RateRow rates={draft.global} onChange={(r) => setRates("global", r)} />
            </div>
          ) : (
            houses.map((h) => (
              <div key={h.id} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h.name}</p>
                <RateRow rates={getRates(h.id)} onChange={(r) => setRates(h.id, r)} />
              </div>
            ))
          )}

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={update.isPending}>{t("settings.save")}</Button>
            {saved && <span className="inline-flex items-center gap-1 text-sm text-green-600"><Check size={14} /> {t("electricity.settingsSaved")}</span>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Editable house header: inline rename + delete ─────────────────────────────
function HouseTitle({ house, canDelete }: { house: { id: number; name: string }; canDelete: boolean }) {
  const { t } = useTranslation();
  const rename = useRenameHouse();
  const del = useDeleteHouse();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(house.name);
  useEffect(() => setName(house.name), [house.name]);

  function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== house.name) rename.mutate({ id: house.id, name: trimmed });
    else setName(house.name);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setName(house.name); setEditing(false); }
          }}
          className="h-8 max-w-[220px]"
        />
        <button type="button" onClick={commit} className="text-green-600 hover:text-green-700" title={t("settings.save")}><Check size={16} /></button>
        <button type="button" onClick={() => { setName(house.name); setEditing(false); }} className="text-muted-foreground hover:text-foreground" title={t("electricity.cancel")}><X size={16} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <CardTitle className="flex items-center gap-2">
        {house.name}
        <button type="button" onClick={() => setEditing(true)} title={t("electricity.renameHouse")}
          className="text-muted-foreground/50 hover:text-foreground transition-colors"><Pencil size={14} /></button>
      </CardTitle>
      {canDelete && (
        <button
          type="button"
          onClick={() => { if (window.confirm(t("electricity.deleteHouseConfirm", { name: house.name }))) del.mutate(house.id); }}
          title={t("electricity.deleteHouse")}
          className="text-muted-foreground/50 hover:text-red-500 transition-colors"
        ><Trash2 size={15} /></button>
      )}
    </div>
  );
}

// ── "Add house" control (dashed placeholder → inline name entry) ───────────────
function AddHouse() {
  const { t } = useTranslation();
  const create = useCreateHouse();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate(n, { onSuccess: () => { setName(""); setOpen(false); } });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[120px] w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      >
        <Plus size={18} /> {t("electricity.addHouse")}
      </button>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <p className="text-sm font-medium">{t("electricity.addHouse")}</p>
        <Input
          autoFocus
          value={name}
          placeholder={t("electricity.houseNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setName(""); setOpen(false); } }}
        />
        <div className="flex gap-2">
          <Button onClick={add} disabled={create.isPending || !name.trim()}>{t("electricity.add")}</Button>
          <Button variant="outline" onClick={() => { setName(""); setOpen(false); }}>{t("electricity.cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Per-house monthly entry with live auto-calculation ────────────────────────
function HouseForm({
  house, reading, year, month, rates, vatPct, subscriptionFee, onSubscriptionChange, subShared, canDelete,
}: {
  house: { id: number; name: string };
  reading?: ElectricityReading;
  year: number;
  month: number;
  rates: ElectricityRates;
  vatPct: number;
  subscriptionFee: number;
  onSubscriptionChange: (v: number) => void;
  subShared: boolean;
  canDelete: boolean;
}) {
  const upsert = useUpsertElectricity();
  const { t } = useTranslation();

  const [tibberTotal, setTibber] = useState(reading?.tibberTotal ?? 0);
  const [totalKwh, setTotalKwh] = useState(reading?.totalKwh ?? 0);
  const [evKwh, setEvKwh] = useState(reading?.evKwh ?? 0);

  useEffect(() => {
    setTibber(reading?.tibberTotal ?? 0);
    setTotalKwh(reading?.totalKwh ?? 0);
    setEvKwh(reading?.evKwh ?? 0);
  }, [reading, house.id]);

  const vatMul = 1 + vatPct / 100;
  // Grid side (computed from rates + the per-month subscription fee); Tibber
  // total is entered directly, incl. VAT.
  const transferCost = totalKwh * rates.transferRatePerKwh;
  const energyTaxTotal = totalKwh * rates.energyTaxPerKwh;
  const gridSubtotal = transferCost + energyTaxTotal + subscriptionFee;
  const gridVat = gridSubtotal * vatPct / 100;
  const gridTotal = gridSubtotal + gridVat;
  const total = tibberTotal + gridTotal;
  const evEnergy = totalKwh > 0 ? (evKwh / totalKwh) * tibberTotal : 0;
  const evShare = evEnergy + evKwh * (rates.transferRatePerKwh + rates.energyTaxPerKwh) * vatMul;

  function save(e: React.FormEvent) {
    e.preventDefault();
    upsert.mutate({
      year, month, houseId: house.id, tibberTotal, totalKwh, evKwh,
      transferRatePerKwh: rates.transferRatePerKwh,
      energyTaxPerKwh: rates.energyTaxPerKwh,
      gridSubscriptionFee: subscriptionFee,
      vatPct,
    });
  }

  return (
    <Card>
      <CardHeader><HouseTitle house={house} canDelete={canDelete} /></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          {/* Mandatory inputs */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{t("electricity.monthlyInputs")}</p>
            <div className="grid grid-cols-2 gap-3">
              <NumField label={t("electricity.tibberTotal")} value={tibberTotal} onChange={setTibber} required />
              <NumField label={t("electricity.totalKwhConsumed")} value={totalKwh} onChange={setTotalKwh} required />
              <NumField label={t("electricity.subscriptionMonthly")} suffix={subShared ? t("electricity.sharedTag") : undefined}
                value={subscriptionFee} onChange={onSubscriptionChange} />
              <NumField label={t("electricity.evKwh")} value={evKwh} onChange={setEvKwh} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5"><span className="text-red-500">*</span> {t("electricity.requiredNote")}</p>
          </div>

          {/* Effective rates (from settings) */}
          <p className="text-[11px] text-muted-foreground rounded-md bg-muted/30 px-2.5 py-1.5">
            {t("electricity.usingRates", {
              transfer: rates.transferRatePerKwh,
              tax: rates.energyTaxPerKwh,
              vat: vatPct,
            })}
          </p>

          {/* Auto-calculated breakdown, grouped by cost source */}
          <div className="rounded-md bg-muted/30 p-3 space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{t("electricity.calculated")}</p>

            {/* Tibber — the energy usage cost (entered directly, incl. VAT) */}
            <CalcSection label={t("electricity.secTibber")} />
            <CalcRow label={t("electricity.energyTibber")} value={fmt(tibberTotal)} />

            {/* Vattenfall — grid transfer, energy tax, fixed fee + VAT */}
            <CalcSection label={t("electricity.secVattenfall")} />
            <CalcRow label={t("electricity.transferCost")} value={fmt(transferCost)} />
            <CalcRow label={t("electricity.energyTaxTotal")} value={fmt(energyTaxTotal)} />
            <CalcRow label={t("electricity.fixedFee")} value={fmt(subscriptionFee)} />
            <CalcRow label={t("electricity.gridVat", { pct: vatPct })} value={fmt(gridVat)} />
            <CalcRow label={t("electricity.totalVattenfall")} value={fmt(gridTotal)} sub />

            {/* Total bill (Tibber + Vattenfall) */}
            <CalcRow label={t("electricity.totalBillLabel")} value={fmt(total)} bold />

            {/* Car charging — the share of the bill attributable to EV kWh */}
            {evKwh > 0 && (
              <>
                <CalcSection label={t("electricity.secCar")} />
                <CalcRow label={t("electricity.evShare")} value={fmt(evShare)} accent />
              </>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={upsert.isPending}>
            {upsert.isPending ? t("electricity.saving") : t("electricity.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function Electricity() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { t } = useTranslation();

  const { data: houses } = useHouses();
  const { data: elec } = useElectricity(year, month);
  const { data: settings } = useElectricitySettings();

  // Subscription fee is a per-month value, lifted here so it can be linked
  // across houses when "same subscription for both houses" is enabled.
  const [subFee, setSubFee] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!houses || !settings) return;
    const init: Record<number, number> = {};
    for (const h of houses) init[h.id] = elec?.readings.find((r) => r.houseId === h.id)?.gridSubscriptionFee ?? 0;
    if (settings.sharedSubscription) {
      const v = houses.map((h) => init[h.id]).find((x) => x > 0) ?? init[houses[0]?.id] ?? 0;
      for (const h of houses) init[h.id] = v;
    }
    setSubFee(init);
  }, [elec, houses, settings?.sharedSubscription, year, month]);

  function setSub(houseId: number, v: number) {
    if (settings?.sharedSubscription && houses) {
      const next: Record<number, number> = {};
      for (const h of houses) next[h.id] = v;
      setSubFee(next);
    } else {
      setSubFee((s) => ({ ...s, [houseId]: v }));
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("electricity.title")}</h1>
        <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {elec && (
        <div className="flex gap-4 flex-wrap">
          <KpiCard label={t("electricity.totalKwh")}  value={fmtKwh(elec.totals.totalKwh)} />
          <KpiCard label={t("electricity.totalBill")} value={fmt(elec.totals.totalBill)} />
          <KpiCard label={t("electricity.totalEv")}   value={fmt(elec.totals.totalEvCost)} />
        </div>
      )}

      {settings && houses && <RatesSettings settings={settings} houses={houses} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {settings && (houses ?? []).map((house) => {
          const reading = elec?.readings.find((r) => r.houseId === house.id);
          return (
            <HouseForm
              key={`${house.id}-${year}-${month}`}
              house={house}
              reading={reading}
              year={year}
              month={month}
              rates={ratesForHouse(settings, house.id)}
              vatPct={settings.vatPct}
              subscriptionFee={subFee[house.id] ?? 0}
              onSubscriptionChange={(v) => setSub(house.id, v)}
              subShared={settings.sharedSubscription}
              canDelete={(houses?.length ?? 0) > 1}
            />
          );
        })}
        {settings && houses && <AddHouse />}
      </div>
    </div>
  );
}
