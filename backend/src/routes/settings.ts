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
  "ui_theme_mode",
  "ui_palette",
  "ui_custom_hue",
  "ui_bg_style",
  "ui_bg_opacity",
  "mortgage_group_forecasts",
  "investments_market_provider",
  "investments_portfolio_provider",
  "investments_manual_fx",
  "primary_house_id",
  "ai_provider",
  "ai_base_url",
  "ai_model",
  "ai_model_heavy",
  "ai_api_key",
] as const;
type SettingKey = typeof ALLOWED_KEYS[number];

// Settings whose value must never be sent back to the client. GET returns a masked
// placeholder ("set") so the UI can show it exists without exposing the secret.
const SECRET_KEYS: SettingKey[] = ["ai_api_key"];
function redact(key: SettingKey, value: string | null): string | null {
  if (value && SECRET_KEYS.includes(key)) return "set";
  return value;
}

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
  for (const key of ALLOWED_KEYS) out[key] = redact(key, getSetting(key));
  res.json(out);
});

// ── Uploaded background image ───────────────────────────────────────────────
// Stored under its own key (NOT in ALLOWED_KEYS) so the potentially large data
// URL never rides the bulk GET /settings payload — the client fetches it only
// when the chosen background style is "photo". The route gets a larger JSON body
// limit in index.ts; the client downscales the image before upload.
const BG_IMAGE_KEY = "ui_bg_image";
const BG_IMAGE_MAX = 3_000_000; // ~3 MB data URL

// GET /api/settings/background-image → { value: dataUrl | null }
router.get("/background-image", (_req: Request, res: Response) => {
  const value = db.select().from(appSettings).where(eq(appSettings.key, BG_IMAGE_KEY)).get()?.value ?? null;
  res.json({ value });
});

// PUT /api/settings/background-image { value: dataUrl }
router.put("/background-image", (req: Request, res: Response) => {
  const parsed = z
    .object({ value: z.string().min(1).max(BG_IMAGE_MAX).startsWith("data:image/") })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  db.insert(appSettings)
    .values({ key: BG_IMAGE_KEY, value: parsed.data.value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: parsed.data.value } })
    .run();
  res.json({ ok: true });
});

// DELETE /api/settings/background-image → clears the stored image
router.delete("/background-image", (_req: Request, res: Response) => {
  db.delete(appSettings).where(eq(appSettings.key, BG_IMAGE_KEY)).run();
  res.json({ ok: true });
});

// GET /api/settings/:key
router.get("/:key", (req: Request, res: Response) => {
  const key = req.params.key as SettingKey;
  if (!ALLOWED_KEYS.includes(key)) {
    res.status(404).json({ error: "Unknown setting" });
    return;
  }
  const value = redact(key, getSetting(key));
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
