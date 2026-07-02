import { Router, Request, Response } from "express";
import { db } from "../db";
import { mortgages } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const MortgageSchema = z.object({
  name:                   z.string().min(1),
  principalAmount:        z.number().positive(),
  interestRate:           z.number().positive(),           // annual %
  amortizationYears:      z.number().int().positive().default(25),
  monthlyPaymentOverride: z.number().positive().optional(),
  effectiveFrom:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:                  z.string().optional(),
  forecast:               z.string().optional(),   // saved rate/amortization changes (JSON)
});

// Amortising loan monthly payment formula
export function calcMonthlyPayment(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Total monthly payment. A manual value is the monthly *amortization* (principal
// paydown, excl. interest), so the total = interest + that amount. If no manual
// value is set, use the calculated annuity payment (which already includes both).
function paymentFor(m: { principalAmount: number; interestRate: number; amortizationYears: number; monthlyPaymentOverride: number | null }): number {
  if (m.monthlyPaymentOverride != null) {
    const monthlyInterest = m.principalAmount * (m.interestRate / 100 / 12);
    return m.monthlyPaymentOverride + monthlyInterest;
  }
  return calcMonthlyPayment(m.principalAmount, m.interestRate, m.amortizationYears);
}

// GET /api/mortgages  — all entries, grouped by name (latest entry first per name)
router.get("/", (_req: Request, res: Response) => {
  const rows = db.select().from(mortgages).orderBy(mortgages.name, mortgages.effectiveFrom).all();
  // Attach calculated payment to each row
  const enriched = rows.map((r) => ({ ...r, calculatedPayment: paymentFor(r) }));
  res.json(enriched);
});

// POST /api/mortgages  — create entry
router.post("/", (req: Request, res: Response) => {
  const parsed = MortgageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.insert(mortgages).values(parsed.data).returning().get();
  res.status(201).json({
    ...row,
    calculatedPayment: paymentFor(row),
  });
});

// PUT /api/mortgages/:id  — update entry
router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = MortgageSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.update(mortgages).set(parsed.data).where(eq(mortgages.id, id)).returning().get();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...row,
    calculatedPayment: paymentFor(row),
  });
});

// DELETE /api/mortgages/:id
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.delete(mortgages).where(eq(mortgages.id, id)).run();
  res.json({ ok: true });
});

// GET /api/mortgages/scenario?principal=&rate=&years=
// Calculate payment and compare to a baseline rate
router.get("/scenario", (req: Request, res: Response) => {
  const principal  = parseFloat(req.query.principal  as string);
  const rate       = parseFloat(req.query.rate       as string);
  const years      = parseInt(req.query.years        as string) || 25;
  const baseRate   = parseFloat(req.query.baseRate   as string); // optional

  if (!principal || !rate) { res.status(400).json({ error: "principal and rate required" }); return; }

  const payment      = calcMonthlyPayment(principal, rate, years);
  const interestPart = principal * (rate / 100 / 12);
  const amortPart    = payment - interestPart;

  const result: Record<string, number> = {
    monthlyPayment:  Math.round(payment),
    interestPortion: Math.round(interestPart),
    amortPortion:    Math.round(amortPart),
    annualTotal:     Math.round(payment * 12),
  };

  if (!isNaN(baseRate) && baseRate > 0) {
    const basePayment = calcMonthlyPayment(principal, baseRate, years);
    result.basePayment   = Math.round(basePayment);
    result.monthlyDelta  = Math.round(payment - basePayment);
    result.annualDelta   = Math.round((payment - basePayment) * 12);
  }

  res.json(result);
});

export default router;
