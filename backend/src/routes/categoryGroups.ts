import { Router, Request, Response } from "express";
import { db } from "../db";
import { categoryGroups, categories } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const GroupSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE", "SAVINGS"]),
  color: z.string().default("#6366f1"),
  sortOrder: z.number().int().default(0),
});

router.get("/", (_req: Request, res: Response) => {
  const rows = db.select().from(categoryGroups).orderBy(categoryGroups.sortOrder).all();
  res.json(rows);
});

router.post("/", (req: Request, res: Response) => {
  const parsed = GroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = db.insert(categoryGroups).values(parsed.data).returning().get();
  res.status(201).json(result);
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = GroupSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = db.update(categoryGroups).set(parsed.data).where(eq(categoryGroups.id, id)).returning().get();
  if (!result) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(result);
});

// Delete a group: detach any categories still pointing at it (set group_id = null)
// so they fall back to "ungrouped" rather than orphaning a dangling FK.
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.update(categories).set({ groupId: null }).where(eq(categories.groupId, id)).run();
  db.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
  res.json({ ok: true });
});

export default router;
