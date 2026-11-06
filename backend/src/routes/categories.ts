import { Router, Request, Response } from "express";
import { db } from "../db";
import { categories, transactions, transactionItems, budgetPlans, recurringTemplates, importMappings } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const CategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE", "SAVINGS"]),
  subtype: z.string().default("OTHER"),
  groupId: z.number().int().nullable().optional(),
  color: z.string().default("#6366f1"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  isHousing: z.boolean().default(false),
});

router.get("/", (_req: Request, res: Response) => {
  const rows = db
    .select()
    .from(categories)
    .orderBy(categories.sortOrder)
    .all();
  res.json(rows);
});

router.post("/", (req: Request, res: Response) => {
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = db.insert(categories).values(parsed.data).returning().get();
  res.status(201).json(result);
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = CategorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = db
    .update(categories)
    .set(parsed.data)
    .where(eq(categories.id, id))
    .returning()
    .get();
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.update(categories)
    .set({ isActive: false })
    .where(eq(categories.id, id))
    .run();
  res.json({ ok: true });
});

// Merge one category into another: repoint every reference (transactions, split
// lines, budgets, recurring templates, import mappings) from :id → intoId in a
// single transaction, then deactivate the now-empty source. Both must be the same
// type so totals stay coherent. This is how duplicate categories get collapsed.
router.post("/:id/merge", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = z.object({ intoId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const intoId = parsed.data.intoId;
  if (intoId === id) { res.status(400).json({ error: "Cannot merge a category into itself." }); return; }

  const src = db.select().from(categories).where(eq(categories.id, id)).get();
  const dst = db.select().from(categories).where(eq(categories.id, intoId)).get();
  if (!src || !dst) { res.status(404).json({ error: "Category not found." }); return; }
  if (src.type !== dst.type) { res.status(400).json({ error: "Categories must be the same type to merge." }); return; }

  const moved = db.transaction((tx) => ({
    transactions: tx.update(transactions).set({ categoryId: intoId }).where(eq(transactions.categoryId, id)).run().changes,
    items: tx.update(transactionItems).set({ categoryId: intoId }).where(eq(transactionItems.categoryId, id)).run().changes,
    budgets: tx.update(budgetPlans).set({ categoryId: intoId }).where(eq(budgetPlans.categoryId, id)).run().changes,
    recurring: tx.update(recurringTemplates).set({ categoryId: intoId }).where(eq(recurringTemplates.categoryId, id)).run().changes,
    mappings: tx.update(importMappings).set({ categoryId: intoId }).where(eq(importMappings.categoryId, id)).run().changes,
    _deactivated: tx.update(categories).set({ isActive: false }).where(eq(categories.id, id)).run().changes,
  }));
  res.json({ ok: true, moved });
});

export default router;
