import { Router, Request, Response } from "express";
import { db } from "../db";
import { worksheets } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// List — omit the (potentially large) `data` blob; most recently edited first.
router.get("/", (_req: Request, res: Response) => {
  try {
    const rows = db
      .select({
        id: worksheets.id,
        name: worksheets.name,
        kind: worksheets.kind,
        sortOrder: worksheets.sortOrder,
        createdAt: worksheets.createdAt,
        updatedAt: worksheets.updatedAt,
      })
      .from(worksheets)
      .all()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json(rows);
  } catch (err: any) {
    console.error("[worksheets] list failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load worksheets" });
  }
});

// Full worksheet incl. the serialized sheet.
router.get("/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.select().from(worksheets).where(eq(worksheets.id, id)).get();
    if (!row) {
      res.status(404).json({ error: "Worksheet not found" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    console.error("[worksheets] get failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load worksheet" });
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(60).optional(),
  data: z.string().max(2_000_000).optional(),
});

router.post("/", (req: Request, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const now = new Date().toISOString();
    const created = db
      .insert(worksheets)
      .values({
        name: parsed.data.name,
        kind: parsed.data.kind ?? "Worksheet",
        data: parsed.data.data ?? "{}",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    res.status(201).json(created);
  } catch (err: any) {
    console.error("[worksheets] create failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to create worksheet" });
  }
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.string().min(1).max(60).optional(),
  data: z.string().max(2_000_000).optional(),
  sortOrder: z.number().int().optional(),
});

router.put("/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const existing = db.select().from(worksheets).where(eq(worksheets.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: "Worksheet not found" });
      return;
    }
    const updated = db
      .update(worksheets)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(worksheets.id, id))
      .returning()
      .get();
    res.json(updated);
  } catch (err: any) {
    console.error("[worksheets] update failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to save worksheet" });
  }
});

router.delete("/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.delete(worksheets).where(eq(worksheets.id, id)).run();
    res.json({ deleted: true });
  } catch (err: any) {
    console.error("[worksheets] delete failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to delete worksheet" });
  }
});

export default router;
