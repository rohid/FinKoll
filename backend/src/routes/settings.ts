import { Router, Request, Response } from "express";
import { db } from "../db";
import { appSettings } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Allowed setting keys — whitelist to prevent arbitrary key writes
const ALLOWED_KEYS = [
  "net_target",
  "ui_expense_alert",
  "ui_savings_alert",
  "ui_zebra_color",
  "ui_zebra_intensity",
  "ui_sidebar_collapsed",
] as const;
type SettingKey = typeof ALLOWED_KEYS[number];

function getSetting(key: SettingKey): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

function setSetting(key: SettingKey, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

// GET /api/settings  → all allowed settings as { key: value|null }
router.get("/", (_req: Request, res: Response) => {
  const out: Record<string, string | null> = {};
  for (const key of ALLOWED_KEYS) out[key] = getSetting(key);
  res.json(out);
});

// GET /api/settings/:key
router.get("/:key", (req: Request, res: Response) => {
  const key = req.params.key as SettingKey;
  if (!ALLOWED_KEYS.includes(key)) {
    res.status(404).json({ error: "Unknown setting" });
    return;
  }
  const value = getSetting(key);
  res.json({ key, value });
});

// PUT /api/settings/:key  { value: string }
router.put("/:key", (req: Request, res: Response) => {
  const key = req.params.key as SettingKey;
  if (!ALLOWED_KEYS.includes(key)) {
    res.status(404).json({ error: "Unknown setting" });
    return;
  }

  const parsed = z.object({ value: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  setSetting(key, parsed.data.value);
  res.json({ key, value: parsed.data.value });
});

export default router;
