import { Router, Request, Response } from "express";
import { db } from "../db";
import { recurringTemplates, transactions, categories } from "../db/schema";
import { eq, and, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { isMonthLocked } from "../services/locks";
import { getPrimaryHouseId } from "../services/houses";

const router = Router();

// Default house for a NEW template with no house specified: a housing-type category
// defaults to the primary residence. (Generated instances inherit the template's own
// houseId, set below.)
function defaultHouseId(categoryId: number): number | null {
  const isHousing = db.select().from(categories).where(eq(categories.id, categoryId)).get()?.isHousing ?? false;
  return isHousing ? getPrimaryHouseId() : null;
}

const TemplateSchema = z.object({
  description: z.string().min(1),
  amount: z.number(),
  categoryId: z.number().int(),
  frequency: z.enum(["MONTHLY", "BIMONTHLY", "QUARTERLY", "HALFYEARLY", "YEARLY"]).default("MONTHLY"),
  activeFromYear: z.number().int(),
  activeFromMonth: z.number().int().min(1).max(12),
  activeToYear: z.number().int().optional(),
  activeToMonth: z.number().int().min(1).max(12).optional(),
  isActive: z.boolean().default(true),
  houseId: z.number().int().nullable().optional(), // null = general cost
});

router.get("/", (_req: Request, res: Response) => {
  const rows = db.select().from(recurringTemplates).all();
  res.json(rows);
});

// Bulk-set the "active from" month (and optionally year) on ALL templates at once
router.post("/bulk-active-from", (req: Request, res: Response) => {
  const parsed = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const set: { activeFromMonth: number; activeFromYear?: number } = { activeFromMonth: parsed.data.month };
  if (parsed.data.year !== undefined) set.activeFromYear = parsed.data.year;

  const result = db.update(recurringTemplates).set(set).run();
  res.json({ updated: result.changes });
});

router.post("/", (req: Request, res: Response) => {
  const parsed = TemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = { ...parsed.data };
  // When no house is given, a housing-type category defaults the template to the
  // primary residence (an explicit null from the client means "general cost").
  if (data.houseId === undefined) data.houseId = defaultHouseId(data.categoryId);
  const result = db.insert(recurringTemplates).values(data).returning().get();
  res.status(201).json(result);
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = TemplateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = db
    .update(recurringTemplates)
    .set(parsed.data)
    .where(eq(recurringTemplates.id, id))
    .returning()
    .get();
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

// Delete a template. Does NOT delete transactions already generated from it —
// those keep their recurring_template_id reference harmlessly.
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.delete(recurringTemplates).where(eq(recurringTemplates.id, id)).run();
  res.json({ ok: true });
});

// Apply templates for a given month — generate transactions
router.post("/:id/apply", (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id);
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }

  const template = db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.id, templateId))
    .get();

  if (!template || !template.isActive) {
    res.status(404).json({ error: "Template not found or inactive" });
    return;
  }

  const date = `${year}-${String(month).padStart(2, "0")}-01`;

  const result = db
    .insert(transactions)
    .values({
      date,
      description: template.description,
      amount: template.amount,
      categoryId: template.categoryId,
      houseId: template.houseId,
      isRecurringInstance: true,
      recurringTemplateId: template.id,
    })
    .returning()
    .get();

  res.status(201).json(result);
});

// Apply all active templates for a month
router.post("/apply-all", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }
  if (isMonthLocked(year, month)) {
    res.status(423).json({ error: "This month is locked. Unlock it before applying templates." });
    return;
  }

  const templates = db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.isActive, true))
    .all();

  const date = `${year}-${String(month).padStart(2, "0")}-01`;
  const created: typeof transactions.$inferSelect[] = [];

  for (const tmpl of templates) {
    // Check template is active for this month
    const afterStart =
      year > tmpl.activeFromYear ||
      (year === tmpl.activeFromYear && month >= tmpl.activeFromMonth);
    const beforeEnd =
      tmpl.activeToYear == null ||
      year < tmpl.activeToYear ||
      (year === tmpl.activeToYear &&
        month <= (tmpl.activeToMonth ?? 12));

    if (!afterStart || !beforeEnd) continue;

    // Determine whether this template fires in the requested month.
    // monthOffset = total months elapsed since the template's anchor date.
    const monthOffset =
      (year - tmpl.activeFromYear) * 12 + (month - tmpl.activeFromMonth);

    if (tmpl.frequency === "YEARLY"     && monthOffset % 12 !== 0) continue;
    if (tmpl.frequency === "HALFYEARLY" && monthOffset % 6  !== 0) continue;
    if (tmpl.frequency === "QUARTERLY"  && monthOffset % 3  !== 0) continue;
    if (tmpl.frequency === "BIMONTHLY"  && monthOffset % 2  !== 0) continue;
    // MONTHLY: always fires (within the active range already checked above)

    const row = db
      .insert(transactions)
      .values({
        date,
        description: tmpl.description,
        amount: tmpl.amount,
        categoryId: tmpl.categoryId,
        houseId: tmpl.houseId,
        isRecurringInstance: true,
        recurringTemplateId: tmpl.id,
      })
      .returning()
      .get();
    created.push(row);
  }

  res.status(201).json({ created: created.length, transactions: created });
});

export default router;
