import { Router, Request, Response } from "express";
import { db } from "../db";
import { transactions, categories, transactionItems, transactionTags } from "../db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { isMonthLocked, ymOf } from "../services/locks";
import { getPrimaryHouseId } from "../services/houses";

const router = Router();

const LOCKED_MSG = "This month is locked. Unlock it before making changes.";

const ItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number(),
  houseId: z.number().int().nullable().optional(), // null/undefined = inherit the transaction's house
  categoryId: z.number().int().nullable().optional(), // null/undefined = inherit the transaction's category
});

const TransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  amount: z.number(),
  categoryId: z.number().int(),
  personId: z.number().int().nullable().optional(),
  payee: z.string().nullable().optional(),
  notes: z.string().optional(),
  houseId: z.number().int().nullable().optional(),
  items: z.array(ItemSchema).optional(),
  tagIds: z.array(z.number().int()).optional(),
});

// Replace all tag links for a transaction (deduped).
function replaceTags(transactionId: number, tagIds: number[]) {
  db.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId)).run();
  for (const tagId of [...new Set(tagIds)]) {
    db.insert(transactionTags).values({ transactionId, tagId }).run();
  }
}

// Fetch tag ids for a list of transaction IDs, keyed by transaction.
function tagsByTx(ids: number[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (ids.length === 0) return map;
  const links = db.select().from(transactionTags).where(inArray(transactionTags.transactionId, ids)).all();
  for (const l of links) {
    if (!map.has(l.transactionId)) map.set(l.transactionId, []);
    map.get(l.transactionId)!.push(l.tagId);
  }
  return map;
}

// Soft data-quality warnings returned with a created transaction. These never block
// the write — the client surfaces them so the user can reconsider (a refund entered
// as a positive expense, an accidental duplicate). Codes are mapped to copy in the UI.
function buildWarnings(txData: { date: string; description: string; amount: number; categoryId: number }, excludeId?: number): string[] {
  const warnings: string[] = [];
  const cat = db.select().from(categories).where(eq(categories.id, txData.categoryId)).get();
  // A negative amount on an expense/savings line is usually a refund/reversal — flag
  // it so it isn't left silently distorting a category total.
  if (txData.amount < 0 && cat && (cat.type === "EXPENSE" || cat.type === "SAVINGS")) warnings.push("negativeAmount");
  // Likely duplicate: same month + category + amount + description already present.
  const { year, month } = ymOf(txData.date);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;
  const sameMonth = db
    .select({ id: transactions.id, description: transactions.description, amount: transactions.amount })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to), eq(transactions.categoryId, txData.categoryId)))
    .all();
  const desc = txData.description.trim().toLowerCase();
  if (sameMonth.some((r) => r.id !== excludeId && r.amount === txData.amount && r.description.trim().toLowerCase() === desc)) {
    warnings.push("duplicate");
  }
  return warnings;
}

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
      personId: transactions.personId,
      payee: transactions.payee,
      notes: transactions.notes,
      houseId: transactions.houseId,
      isRecurringInstance: transactions.isRecurringInstance,
      recurringTemplateId: transactions.recurringTemplateId,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(transactions.date)
    .all();

  const withItems = attachItems(rows);
  const tagMap = tagsByTx(withItems.map((r) => r.id));
  res.json(withItems.map((r) => ({ ...r, tagIds: tagMap.get(r.id) ?? [] })));
});

router.post("/", (req: Request, res: Response) => {
  const parsed = TransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { items, tagIds, ...txData } = parsed.data;
  // Block if target month is locked
  const { year: pY, month: pM } = ymOf(txData.date);
  if (isMonthLocked(pY, pM)) { res.status(423).json({ error: LOCKED_MSG }); return; }
  // If items provided, amount = sum of items
  if (items && items.length > 0) {
    txData.amount = items.reduce((s, i) => s + i.amount, 0);
  }
  // Guardrail: a zero-amount entry is never meaningful and would just be noise in
  // every total — reject it rather than store it.
  if (txData.amount === 0) { res.status(400).json({ error: "Amount cannot be zero." }); return; }
  // Default the house from the category when the client didn't set it: a
  // housing-type category assigns new transactions to the primary residence.
  if (txData.houseId === undefined) {
    const cat = db.select().from(categories).where(eq(categories.id, txData.categoryId)).get();
    txData.houseId = cat?.isHousing ? getPrimaryHouseId() : null;
  }
  const warnings = buildWarnings(txData, undefined);
  const result = db.insert(transactions).values(txData).returning().get();
  if (items && items.length > 0) replaceItems(result.id, items);
  if (tagIds && tagIds.length > 0) replaceTags(result.id, tagIds);
  res.status(201).json({ ...result, items: items ?? [], tagIds: tagIds ?? [], warnings });
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = TransactionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { items, tagIds, ...txData } = parsed.data;
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
  if (txData.amount === 0) { res.status(400).json({ error: "Amount cannot be zero." }); return; }
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
  // Always replace items/tags when the key is present (empty array = clear).
  if (items !== undefined) replaceItems(id, items);
  if (tagIds !== undefined) replaceTags(id, tagIds);
  const currentItems = db.select().from(transactionItems).where(eq(transactionItems.transactionId, id)).all();
  const currentTags = db.select().from(transactionTags).where(eq(transactionTags.transactionId, id)).all().map((t) => t.tagId);
  res.json({ ...result, items: currentItems, tagIds: currentTags });
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
