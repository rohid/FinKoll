import { Router, Request, Response } from "express";
import { getTemplateSignals, computeHealthScore, getTrendObservations, getSavingsBreakdown, getDataHealth } from "../services/insights";
import { getMonthlySummary } from "../services/summary";
import { db } from "../db";
import { appSettings } from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/insights/month?year=&month=
router.get("/month", (req: Request, res: Response) => {
  const year  = parseInt(req.query.year  as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) { res.status(400).json({ error: "year and month required" }); return; }

  const signals  = getTemplateSignals(year, month);
  const summary  = getMonthlySummary(year, month);

  const netTargetRow      = db.select().from(appSettings).where(eq(appSettings.key, "net_target")).get();
  const savingsTargetRow  = db.select().from(appSettings).where(eq(appSettings.key, "savings_target")).get();
  const netTarget         = netTargetRow     ? parseFloat(netTargetRow.value)    : null;
  const savingsTarget     = savingsTargetRow ? parseFloat(savingsTargetRow.value) : 15;

  const healthScore   = computeHealthScore(signals, summary, netTarget, savingsTarget);
  const observations  = getTrendObservations(year, month);

  res.json({ signals, healthScore, observations });
});

// GET /api/insights/savings?year=
router.get("/savings", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) { res.status(400).json({ error: "year required" }); return; }
  const now = new Date();
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  res.json(getSavingsBreakdown(year, currentMonth));
});

// GET /api/insights/health — data-quality review queue
router.get("/health", (_req: Request, res: Response) => {
  res.json(getDataHealth());
});

export default router;
