import { Router, Request, Response } from "express";
import { db } from "../db";
import { electricityReadings, houses, appSettings } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ── Rate settings (transfer rate, energy tax, fixed fee, VAT) ─────────────────
// Stored as one JSON blob in app_settings. Rates can be per-house or shared.
const RATES_KEY = "electricity_rates";

const RatesSchema = z.object({
  transferRatePerKwh: z.number().default(0),
  energyTaxPerKwh: z.number().default(0),
});
const SettingsSchema = z.object({
  vatPct: z.number().min(0).max(100).default(25),
  shared: z.boolean().default(false),
  sharedSubscription: z.boolean().default(false),
  global: RatesSchema,
  perHouse: z.record(RatesSchema).default({}),
});
type ElecSettings = z.infer<typeof SettingsSchema>;

const DEFAULT_RATES = { transferRatePerKwh: 0, energyTaxPerKwh: 0 };
const DEFAULT_SETTINGS: ElecSettings = { vatPct: 25, shared: false, sharedSubscription: false, global: { ...DEFAULT_RATES }, perHouse: {} };

const rate = (o: any) => ({ transferRatePerKwh: Number(o?.transferRatePerKwh) || 0, energyTaxPerKwh: Number(o?.energyTaxPerKwh) || 0 });

function readSettings(): ElecSettings {
  const row = db.select().from(appSettings).where(eq(appSettings.key, RATES_KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  try {
    const p = JSON.parse(row.value);
    const perHouse: Record<string, { transferRatePerKwh: number; energyTaxPerKwh: number }> = {};
    for (const [k, v] of Object.entries(p.perHouse ?? {})) perHouse[k] = rate(v);
    return {
      vatPct: typeof p.vatPct === "number" ? p.vatPct : 25,
      shared: !!p.shared,
      sharedSubscription: !!p.sharedSubscription,
      global: rate(p.global),
      perHouse,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

router.get("/settings", (_req: Request, res: Response) => {
  res.json(readSettings());
});

router.put("/settings", (req: Request, res: Response) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const value = JSON.stringify(parsed.data);
  db.insert(appSettings)
    .values({ key: RATES_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
  res.json(parsed.data);
});

// ── Monthly readings ──────────────────────────────────────────────────────────
const ReadingSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  houseId: z.number().int(),
  // Variable monthly inputs
  tibberTotal: z.number().default(0), // supplier invoice total, incl. VAT/fees
  totalKwh: z.number().default(0),
  evKwh: z.number().default(0),
  pricePerKwh: z.number().default(0), // legacy, unused
  // Grid-side rates snapshotted from settings (history keeps its own rates)
  transferRatePerKwh: z.number().default(0),
  energyTaxPerKwh: z.number().default(0),
  gridSubscriptionFee: z.number().default(0),
  vatPct: z.number().min(0).max(100).default(25),
});

function computeFields(d: z.infer<typeof ReadingSchema>) {
  const vatMul = 1 + d.vatPct / 100;
  // Grid side (elnät): transfer + energy tax per kWh, plus the fixed fee, + VAT.
  const transferCost = d.totalKwh * d.transferRatePerKwh;
  const energyTaxTotal = d.totalKwh * d.energyTaxPerKwh;
  const gridSubtotalExVat = transferCost + energyTaxTotal + d.gridSubscriptionFee;
  const gridTotal = gridSubtotalExVat * vatMul;
  // Total = Tibber's all-in supplier total + the grid total.
  const totalBill = d.tibberTotal + gridTotal;
  // EV share (informational): its proportion of the Tibber energy total + the
  // EV portion of the variable grid charges, incl. VAT.
  const evEnergy = d.totalKwh > 0 ? (d.evKwh / d.totalKwh) * d.tibberTotal : 0;
  const evGrid = d.evKwh * (d.transferRatePerKwh + d.energyTaxPerKwh) * vatMul;
  const evTotal = evEnergy + evGrid;

  return {
    ...d,
    transferCost,
    energyTaxTotal,
    vattenfallTotal: gridSubtotalExVat, // legacy column reused for the grid ex-VAT subtotal
    evTotal,
    totalBill,
    evCostVattenfall: 0,
    evCostTibber: 0,
    evVat: 0,
  };
}

router.get("/houses", (_req: Request, res: Response) => {
  res.json(db.select().from(houses).orderBy(houses.sortOrder).all());
});

const HouseNameSchema = z.object({ name: z.string().trim().min(1).max(60) });

// Add a house (e.g. a second/third property). New name, placed after existing.
router.post("/houses", (req: Request, res: Response) => {
  const parsed = HouseNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const maxOrder = db.select().from(houses).all().reduce((m, h) => Math.max(m, h.sortOrder), 0);
  const created = db.insert(houses).values({ name: parsed.data.name, sortOrder: maxOrder + 1 }).returning().get();
  res.status(201).json(created);
});

// Rename a house.
router.patch("/houses/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = HouseNameSchema.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "invalid id" : parsed.error.flatten() });
    return;
  }
  const updated = db.update(houses).set({ name: parsed.data.name }).where(eq(houses.id, id)).returning().get();
  if (!updated) { res.status(404).json({ error: "house not found" }); return; }
  res.json(updated);
});

// Remove a house and its electricity readings. Refuses to delete the last house.
router.delete("/houses/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  const all = db.select().from(houses).all();
  if (!all.some((h) => h.id === id)) { res.status(404).json({ error: "house not found" }); return; }
  if (all.length <= 1) { res.status(400).json({ error: "cannot delete the last house" }); return; }
  db.transaction((tx) => {
    tx.delete(electricityReadings).where(eq(electricityReadings.houseId, id)).run();
    tx.delete(houses).where(eq(houses.id, id)).run();
  });
  res.status(204).end();
});

// Yearly aggregate across all houses, per month — for the Analytics charts.
router.get("/yearly", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) { res.status(400).json({ error: "year required" }); return; }

  const rows = db.select().from(electricityReadings).where(eq(electricityReadings.year, year)).all();

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, totalKwh: 0, tibber: 0, grid: 0, totalBill: 0, evKwh: 0, evTotal: 0,
  }));
  for (const r of rows) {
    const m = months[r.month - 1];
    if (!m) continue;
    m.totalKwh += r.totalKwh;
    m.tibber += r.tibberTotal;
    m.grid += r.totalBill - r.tibberTotal; // grid incl. VAT
    m.totalBill += r.totalBill;
    m.evKwh += r.evKwh;
    m.evTotal += r.evTotal;
  }
  const totals = months.reduce(
    (a, m) => ({
      totalKwh: a.totalKwh + m.totalKwh, tibber: a.tibber + m.tibber, grid: a.grid + m.grid,
      totalBill: a.totalBill + m.totalBill, evKwh: a.evKwh + m.evKwh, evTotal: a.evTotal + m.evTotal,
    }),
    { totalKwh: 0, tibber: 0, grid: 0, totalBill: 0, evKwh: 0, evTotal: 0 },
  );
  res.json({ year, months, totals });
});

router.get("/", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (!year || !month) {
    res.status(400).json({ error: "year and month required" });
    return;
  }

  const rows = db
    .select()
    .from(electricityReadings)
    .where(and(eq(electricityReadings.year, year), eq(electricityReadings.month, month)))
    .all();

  const totalKwh = rows.reduce((s, r) => s + r.totalKwh, 0);
  const totalBill = rows.reduce((s, r) => s + r.totalBill, 0);
  const totalEvCost = rows.reduce((s, r) => s + r.evTotal, 0);

  res.json({ readings: rows, totals: { totalKwh, totalBill, totalEvCost } });
});

router.post("/", (req: Request, res: Response) => {
  const parsed = ReadingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const withComputed = computeFields(parsed.data);

  const existing = db
    .select()
    .from(electricityReadings)
    .where(
      and(
        eq(electricityReadings.year, parsed.data.year),
        eq(electricityReadings.month, parsed.data.month),
        eq(electricityReadings.houseId, parsed.data.houseId),
      ),
    )
    .get();

  const result = existing
    ? db.update(electricityReadings).set(withComputed).where(eq(electricityReadings.id, existing.id)).returning().get()
    : db.insert(electricityReadings).values(withComputed).returning().get();

  res.status(201).json(result);
});

export default router;
