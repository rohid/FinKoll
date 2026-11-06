import { Router, Request, Response } from "express";
import { db } from "../db";
import { people, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const PersonSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

router.get("/", (_req: Request, res: Response) => {
  res.json(db.select().from(people).orderBy(people.sortOrder).all());
});

router.post("/", (req: Request, res: Response) => {
  const parsed = PersonSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  res.status(201).json(db.insert(people).values(parsed.data).returning().get());
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = PersonSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const result = db.update(people).set(parsed.data).where(eq(people.id, id)).returning().get();
  if (!result) { res.status(404).json({ error: "Not found" }); return; }
  res.json(result);
});

// Delete a person: detach their transactions (person_id = null) rather than losing
// the transactions themselves.
router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.update(transactions).set({ personId: null }).where(eq(transactions.personId, id)).run();
  db.delete(people).where(eq(people.id, id)).run();
  res.json({ ok: true });
});

export default router;
