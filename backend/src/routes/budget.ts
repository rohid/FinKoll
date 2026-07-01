import { Router, Request, Response } from "express";
import { db } from "../db";
import { budgetPlans, categories } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const BudgetSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  categoryId: z.number().int(),
  plannedAmount: z.number(),
});

router.get("/", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }

  const rows = db
    .select({
      id: budgetPlans.id,
      year: budgetPlans.year,
      month: budgetPlans.month,
      categoryId: budgetPlans.categoryId,
      plannedAmount: budgetPlans.plannedAmount,
      categoryName: categories.name,
      categoryType: categories.type,
    })
    .from(budgetPlans)
    .innerJoin(categories, eq(budgetPlans.categoryId, categories.id))
    .where(and(eq(budgetPlans.year, year), eq(budgetPlans.month, month)))
    .all();

  res.json(rows);
});

router.post("/", (req: Request, res: Response) => {
  const parsed = BudgetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Upsert: delete existing then insert
  db.delete(budgetPlans)
    .where(
      and(
        eq(budgetPlans.year, parsed.data.year),
        eq(budgetPlans.month, parsed.data.month),
        eq(budgetPlans.categoryId, parsed.data.categoryId)
      )
    )
    .run();

  const result = db.insert(budgetPlans).values(parsed.data).returning().get();
  res.status(201).json(result);
});

export default router;
