import { Router, Request, Response } from "express";
import { db } from "../db";
import { monthLocks } from "../db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

// GET /api/locks/:year/:month  → { locked: bool, lockedAt?: string }
router.get("/:year/:month", (req: Request, res: Response) => {
  const year  = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  const row = db.select().from(monthLocks)
    .where(and(eq(monthLocks.year, year), eq(monthLocks.month, month)))
    .get();
  res.json({ locked: !!row, lockedAt: row?.lockedAt ?? null });
});

// GET /api/locks/:year  → { lockedMonths: number[] }  (months 1-12 that are locked)
router.get("/:year", (req: Request, res: Response) => {
  const year = parseInt(req.params.year);
  const rows = db.select().from(monthLocks).where(eq(monthLocks.year, year)).all();
  res.json({ lockedMonths: rows.map((r) => r.month) });
});

// POST /api/locks/:year/:month  → lock a month
router.post("/:year/:month", (req: Request, res: Response) => {
  const year  = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  const lockedAt = new Date().toISOString();
  db.insert(monthLocks)
    .values({ year, month, lockedAt })
    .onConflictDoUpdate({ target: [monthLocks.year, monthLocks.month], set: { lockedAt } })
    .run();
  res.json({ locked: true, lockedAt });
});

// DELETE /api/locks/:year/:month  → unlock a month
router.delete("/:year/:month", (req: Request, res: Response) => {
  const year  = parseInt(req.params.year);
  const month = parseInt(req.params.month);
  db.delete(monthLocks)
    .where(and(eq(monthLocks.year, year), eq(monthLocks.month, month)))
    .run();
  res.json({ locked: false });
});

export default router;
