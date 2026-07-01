import { Router, Request, Response } from "express";
import { db } from "../db";
import { transactions, categories, transactionItems } from "../db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { isMonthLocked, ymOf } from "../services/locks";

const router = Router();

const LOCKED_MSG = "This month is locked. Unlock it before making changes.";

const ItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number(),
});

const TransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  amount: z.number(),
  categoryId: z.number().int(),
  notes: z.string().optional(),
  items: z.array(ItemSchema).optional(),
});

// Fetch items for a list of transaction IDs and attach them
function attachItems(rows: any[]): any[] {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const items = db
    .select()
    .from(transactionItems)
    .where(inArray(transactionItems.transactionId, ids))
    .all();
  const byTxId = new Map<number, typeof items>();
  for (const item of items) {
    if (!byTxId.has(item.transactionId)) byTxId.set(item.transactionId, []);
    byTxId.get(item.transactionId)!.push(item);
  }
  return rows.map((r) => ({ ...r, items: byTxId.get(r.id) ?? [] }));
}

// Replace all items for a transaction
function replaceItems(transactionId: number, items: z.infer<typeof ItemSchema>[]) {
  db.delete(transactionItems).where(eq(transactionItems.transactionId, transactionId)).run();
  for (const item of items) {
    db.insert(transactionItems).values({ ...item, transactionId }).run();
  }
}

router.get("/", (req: Request, res: Response) => {
  const year  = parseInt(req.query.year  as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to   = `${year}-${String(month).padStart(2, "0")}-31`;

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryType: categories.type,
      categoryColor: categories.color,
      notes: transactions.notes,
      isRecurringInstance: transactions.isRecurringInstance,
      recurringTemplateId: transactions.recurringTemplateId,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(transactions.date)
    .all();

  res.json(attachItems(rows));
});

router.post("/", (req: Request, res: Response) => {
  const parsed = TransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { items, ...txData } = parsed.data;
  // Block if target month is locked
  const { year: pY, month: pM } = ymOf(txData.date);
  if (isMonthLocked(pY, pM)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  // If items provided, amount = sum of items
  if (items && items.length > 0) {
    txData.amount = items.reduce((s, i) => s + i.amount, 0);
  }
  const result = db.insert(transactions).values(txData).returning().get();
  if (items && items.length > 0) replaceItems(result.id, items);
  res.status(201).json({ ...result, items: items ?? [] });
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = TransactionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { items, ...txData } = parsed.data;
  // Block if the transaction's existing month, or the new target month, is locked
  const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (existing) {
    const cur = ymOf(existing.date);
    if (isMonthLocked(cur.year, cur.month)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  }
  if (txData.date) {
    const next = ymOf(txData.date);
    if (isMonthLocked(next.year, next.month)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  }
  // If items provided, recalculate amount
  if (items && items.length > 0) {
    txData.amount = items.reduce((s, i) => s + i.amount, 0);
  }
  const result = db
    .update(transactions)
    .set(txData)
    .where(eq(transactions.id, id))
    .returning()
    .get();
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Always replace items when the key is present (even if empty array = clear items)
  if (items !== undefined) replaceItems(id, items);
  const currentItems = db.select().from(transactionItems).where(eq(transactionItems.transactionId, id)).all();
  res.json({ ...result, items: currentItems });
});

// Delete all transactions for a given month — must be registered before /:id
router.delete("/month", (req: Request, res: Response) => {
  const year  = parseInt(req.query.year  as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }
  if (isMonthLocked(year, month)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to   = `${year}-${String(month).padStart(2, "0")}-31`;
  const result = db
    .delete(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .run();
  res.json({ deleted: result.changes });
});

router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (existing) {
    const { year, month } = ymOf(existing.date);
    if (isMonthLocked(year, month)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  }
  db.delete(transactions).where(eq(transactions.id, id)).run();
  res.json({ ok: true });
});

export default router;
