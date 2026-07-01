import { Router, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { sqlite } from "../db";
import { createBackup } from "../services/backup";

const router = Router();

// Modest throttle on this powerful admin surface.
const sqlLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// POST /api/sql  { query: string, allowWrite?: boolean }
router.post("/", sqlLimiter, async (req: Request, res: Response) => {
  // Optional kill-switch for deployments that don't want a live SQL console.
  if (process.env.SQL_CONSOLE === "false") {
    res.status(403).json({ error: "SQL console is disabled." });
    return;
  }

  const query = (req.body?.query ?? "").trim();
  const allowWrite = req.body?.allowWrite === true;

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const stmt = sqlite.prepare(query);

    // Authoritative read/write classification from SQLite itself — not a keyword
    // guess. Closes the `WITH … RETURNING` bypass that a prefix check misses.
    if (stmt.readonly) {
      const rows = stmt.all();
      const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];
      res.json({ readOnly: true, rowCount: rows.length, columns, rows });
      return;
    }

    // Write / DDL path — require explicit opt-in and always snapshot first
    if (!allowWrite) {
      res.status(400).json({
        error: "This is a write/DDL statement. Re-run with the write toggle enabled to confirm.",
        requiresWrite: true,
      });
      return;
    }

    // SAFETY: snapshot before any data-modifying statement
    const backup = await createBackup("presql");

    const info = stmt.run();
    res.json({
      readOnly: false,
      changes: info.changes,
      lastInsertRowid: Number(info.lastInsertRowid),
      backup: backup.filename,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Query failed" });
  }
});

// GET /api/sql/schema — list tables + columns for the GUI reference
router.get("/schema", (_req: Request, res: Response) => {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")
    .all() as { name: string }[];

  const schema = tables.map((t) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string; type: string }[];
    return { table: t.name, columns: cols.map((c) => ({ name: c.name, type: c.type })) };
  });

  res.json(schema);
});

export default router;
