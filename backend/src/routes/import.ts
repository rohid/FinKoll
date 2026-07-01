import { Router, Request, Response } from "express";
import { db } from "../db";
import { transactions, categories, importMappings } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { createBackup } from "../services/backup";
import { isMonthLocked } from "../services/locks";

const router = Router();

/** Normalize a row label into the alias key. Must match the frontend. */
export function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// GET /api/import/mappings → saved label→category aliases (only for existing active categories)
router.get("/mappings", (_req: Request, res: Response) => {
  try {
    const rows = db
      .select({ label: importMappings.label, categoryId: importMappings.categoryId, type: categories.type })
      .from(importMappings)
      .innerJoin(categories, eq(importMappings.categoryId, categories.id))
      .where(eq(categories.isActive, true))
      .all();
    res.json(rows);
  } catch (err) {
    // Table may not exist yet (migration not run) — degrade gracefully
    console.error("[import] could not read alias mappings:", err);
    res.json([]);
  }
});

// GET /api/import/existing-months?year=  → months (1-12) that already have transactions
router.get("/existing-months", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  if (!year) { res.status(400).json({ error: "year required" }); return; }
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const rows = db
    .select({ m: sql<string>`strftime('%m', ${transactions.date})` })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(sql`strftime('%m', ${transactions.date})`)
    .all();
  res.json({ months: rows.map((r) => parseInt(r.m)) });
});

const CommitSchema = z.object({
  year: z.number().int(),
  forceOverwrite: z.boolean().default(false),
  overwriteMonths: z.array(z.number().int().min(1).max(12)).default([]),
  newCategories: z.array(z.object({
    tempId: z.string(),
    name: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE", "SAVINGS"]),
    color: z.string().default("#6366f1"),
  })).default([]),
  rows: z.array(z.object({
    description: z.string().min(1),
    categoryId: z.number().int().optional(),
    newCategoryTempId: z.string().optional(),
    amounts: z.record(z.string(), z.number()),  // { "1": 32499, "5": 28400 }
  })),
});

// POST /api/import/commit
router.post("/commit", async (req: Request, res: Response) => {
  const parsed = CommitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { year, forceOverwrite, overwriteMonths, newCategories, rows } = parsed.data;

  // 1. Target months = every month referenced by any row
  const targetMonths = new Set<number>();
  for (const r of rows) for (const m of Object.keys(r.amounts)) targetMonths.add(parseInt(m));
  const targets = [...targetMonths];

  // 2. Block locked months outright
  const locked = targets.filter((m) => isMonthLocked(year, m));
  if (locked.length > 0) {
    res.status(423).json({ error: "locked", lockedMonths: locked });
    return;
  }

  // 3. Which target months already have data?
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const existingRows = db
    .select({ m: sql<string>`strftime('%m', ${transactions.date})` })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(sql`strftime('%m', ${transactions.date})`)
    .all();
  const monthsWithData = new Set(existingRows.map((r) => parseInt(r.m)));
  const conflicting = targets.filter((m) => monthsWithData.has(m));

  // 4. Which conflicting months are approved for overwrite?
  const approved = new Set(forceOverwrite ? conflicting : overwriteMonths);
  const unapproved = conflicting.filter((m) => !approved.has(m));

  // 5. If any conflicting month is not approved → stop and ask
  if (unapproved.length > 0) {
    res.json({ committed: false, needsConfirmation: unapproved });
    return;
  }

  // 6. Commit — backup first (safety). Wrapped so any failure returns a clear
  //    error to the client instead of throwing out of the async handler, which
  //    Express 4 would NOT catch — leaving the request hung and surfacing as a
  //    nginx 502 with no explanation.
  try {
    // Safety backup before we modify any data. If this fails we abort the
    // import rather than risk an un-backed-up destructive write.
    let backup;
    try {
      backup = await createBackup("preimport");
    } catch (err: any) {
      console.error("[import] pre-import backup FAILED — aborting import to protect data:", err);
      res.status(500).json({
        error: `Could not create a safety backup before importing, so the import was aborted to protect your data. Cause: ${err?.message ?? String(err)}`,
      });
      return;
    }

    // Create new categories, map tempId → id
    const tempIdToId = new Map<string, number>();
    for (const nc of newCategories) {
      const created = db.insert(categories)
        .values({ name: nc.name, type: nc.type, color: nc.color, subtype: "OTHER" })
        .returning().get();
      tempIdToId.set(nc.tempId, created.id);
    }

    // Overwrite approved months (delete existing transactions there)
    for (const m of approved) {
      const mFrom = `${year}-${String(m).padStart(2, "0")}-01`;
      const mTo   = `${year}-${String(m).padStart(2, "0")}-31`;
      db.delete(transactions).where(and(gte(transactions.date, mFrom), lte(transactions.date, mTo))).run();
    }

    // Insert (wrapped in a single transaction for atomicity)
    let inserted = 0;
    db.transaction((tx) => {
      for (const r of rows) {
        const catId = r.categoryId ?? (r.newCategoryTempId ? tempIdToId.get(r.newCategoryTempId) : undefined);
        if (!catId) continue; // unmapped row — skip

        // Remember this label→category mapping so future imports auto-apply it.
        // Best-effort: the alias memory is a convenience, so a failure here
        // (e.g. table missing before its migration has run) must never abort
        // the actual transaction import.
        try {
          tx.insert(importMappings)
            .values({ label: normalizeLabel(r.description), categoryId: catId })
            .onConflictDoUpdate({ target: importMappings.label, set: { categoryId: catId } })
            .run();
        } catch (err) {
          console.error("[import] could not save alias mapping (continuing):", err);
        }

        for (const [mStr, amount] of Object.entries(r.amounts)) {
          const m = parseInt(mStr);
          const date = `${year}-${String(m).padStart(2, "0")}-01`;
          tx.insert(transactions).values({
            date,
            description: r.description,
            amount,
            categoryId: catId,
          }).run();
          inserted++;
        }
      }
    });

    res.json({
      committed: true,
      inserted,
      backup: backup.filename,
      createdCategories: [...tempIdToId.entries()].map(([tempId, id]) => ({ tempId, id })),
    });
  } catch (err: any) {
    console.error("[import] commit failed:", err);
    res.status(500).json({ error: err?.message ?? "Import failed" });
  }
});

export default router;
