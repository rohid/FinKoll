import { Router, Request, Response } from "express";
import { db } from "../db";
import { categories } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const CategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE", "SAVINGS"]),
  subtype: z.string().default("OTHER"),
  color: z.string().default("#6366f1"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
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

export default router;
