import { Router, Request, Response } from "express";
import path from "path";
import {
  createBackup,
  listBackups,
  restoreBackup,
  backupFilePath,
} from "../services/backup";

const router = Router();

/** GET /api/backup — list all backups */
router.get("/", (_req: Request, res: Response) => {
  try {
    res.json(listBackups());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/backup — trigger a manual backup */
router.post("/", async (_req: Request, res: Response) => {
  try {
    const entry = await createBackup("manual");
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/backup/:filename/restore — restore from a backup */
router.post("/:filename/restore", (req: Request, res: Response) => {
  try {
    // Send response before process.exit so client gets it
    res.json({ ok: true, message: "Restoring… server will restart." });
    setTimeout(() => restoreBackup(req.params.filename), 200);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/backup/:filename/download — download a backup file */
router.get("/:filename/download", (req: Request, res: Response) => {
  try {
    const filePath = backupFilePath(req.params.filename);
    res.download(filePath, path.basename(filePath));
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
