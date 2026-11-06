import { Router, Request, Response } from "express";
import { db } from "../db";
import { pensionHoldings, pensionSnapshots } from "../db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const PENSION_TYPES = ["ALLMAN", "TJANSTE", "PRIVAT"] as const;

const HoldingSchema = z.object({
  name: z.string().min(1),
  type: z.enum(PENSION_TYPES).default("TJANSTE"),
  manager: z.string().nullable().optional(),
  currentValue: z.number().default(0),
  projectedMonthlyPayout: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().nullable().optional(),
  asOf: z.string().nullable().optional(),
});

// Upsert today's total-capital snapshot for the value-over-time chart. Called on
// every mutation so the chart tracks each manual update.
function writeSnapshot(): void {
  const total = db.select().from(pensionHoldings).all().reduce((s, h) => s + h.currentValue, 0);
  const date = new Date().toISOString().slice(0, 10);
  db.insert(pensionSnapshots)
    .values({ date, totalValueSek: total })
    .onConflictDoUpdate({ target: pensionSnapshots.date, set: { totalValueSek: total } })
    .run();
}

// Per-bucket + grand totals for the capital and projected-payout figures.
function buildSummary(rows: typeof pensionHoldings.$inferSelect[]) {
  const byType = PENSION_TYPES.map((type) => {
    const of = rows.filter((r) => r.type === type);
    return {
      type,
      total: of.reduce((s, r) => s + r.currentValue, 0),
      payout: of.reduce((s, r) => s + (r.projectedMonthlyPayout ?? 0), 0),
      count: of.length,
    };
  });
  return {
    byType,
    totalCapital: rows.reduce((s, r) => s + r.currentValue, 0),
    totalProjectedPayout: rows.reduce((s, r) => s + (r.projectedMonthlyPayout ?? 0), 0),
  };
}

// GET /pension — holdings, summary totals, and the capital history for the chart.
router.get("/", (_req: Request, res: Response) => {
  const rows = db.select().from(pensionHoldings).orderBy(asc(pensionHoldings.sortOrder), asc(pensionHoldings.id)).all();
  const history = db.select().from(pensionSnapshots).orderBy(asc(pensionSnapshots.date)).all();
  res.json({ holdings: rows, summary: buildSummary(rows), history });
});

router.post("/", (req: Request, res: Response) => {
  const parsed = HoldingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.insert(pensionHoldings).values(parsed.data).returning().get();
  writeSnapshot();
  res.status(201).json(row);
});

// POST /pension/bulk — create many holdings at once (paste from minpension).
router.post("/bulk", (req: Request, res: Response) => {
  const parsed = z.object({ holdings: z.array(HoldingSchema).min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const created = parsed.data.holdings.map((h) => db.insert(pensionHoldings).values(h).returning().get());
  writeSnapshot();
  res.status(201).json({ created: created.length, holdings: created });
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = HoldingSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.update(pensionHoldings).set(parsed.data).where(eq(pensionHoldings.id, id)).returning().get();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  writeSnapshot();
  res.json(row);
});

router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.delete(pensionHoldings).where(eq(pensionHoldings.id, id)).run();
  writeSnapshot();
  res.json({ ok: true });
});

export default router;
