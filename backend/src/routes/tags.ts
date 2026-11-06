import { Router, Request, Response } from "express";
import { db } from "../db";
import { tags } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const TagSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#6366f1"),
});

router.get("/", (_req: Request, res: Response) => {
  res.json(db.select().from(tags).orderBy(tags.name).all());
});

router.post("/", (req: Request, res: Response) => {
  const parsed = TagSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  res.status(201).json(db.insert(tags).values(parsed.data).returning().get());
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = TagSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const result = db.update(tags).set(parsed.data).where(eq(tags.id, id)).returning().get();
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

// Delete a tag: the transaction_tags rows cascade on the FK, so the links go too.
router.delete("/:id", (req: Request, res: Response) => {
  db.delete(tags).where(eq(tags.id, parseInt(req.params.id))).run();
  res.json({ ok: true });
});

export default router;
