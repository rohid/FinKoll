import { Router, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { assistantMessages } from "../db/schema";
import { desc } from "drizzle-orm";
import { isConfigured, activeProviderId, runChat, commitDraft } from "../services/ai/service";

const router = Router();

// Modest throttle — the chat can fan out to tool calls and a cloud API.
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

const MsgSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) });
const DraftSchema = z.object({ tool: z.string(), args: z.record(z.unknown()), preview: z.string() });

// GET /api/assistant/status — is a provider configured? (UI shows/hides the chat)
router.get("/status", (_req: Request, res: Response) => {
  res.json({ configured: isConfigured(), provider: activeProviderId() });
});

// GET /api/assistant/history — recent messages to seed the chat on load.
router.get("/history", (_req: Request, res: Response) => {
  const rows = db.select().from(assistantMessages).orderBy(desc(assistantMessages.id)).limit(50).all();
  res.json(rows.reverse());
});

// POST /api/assistant/chat — run one turn. Returns the answer plus any write
// drafts awaiting confirmation. Reads execute here; writes never auto-commit.
router.post("/chat", limiter, async (req: Request, res: Response) => {
  if (!isConfigured()) { res.status(409).json({ error: "No AI provider configured. Set one up in Settings." }); return; }
  const parsed = z.object({ messages: z.array(MsgSchema).min(1).max(40) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const result = await runChat(parsed.data.messages);
    const now = new Date().toISOString();
    const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user");
    if (lastUser) db.insert(assistantMessages).values({ role: "user", content: lastUser.content, createdAt: now }).run();
    const reply = result.text || (result.drafts.length ? `(prepared ${result.drafts.length} change${result.drafts.length > 1 ? "s" : ""} to confirm)` : "");
    if (reply) db.insert(assistantMessages).values({ role: "assistant", content: reply, createdAt: now }).run();
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// POST /api/assistant/commit — execute a confirmed write draft.
router.post("/commit", limiter, (req: Request, res: Response) => {
  const parsed = DraftSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const result = commitDraft(parsed.data);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
