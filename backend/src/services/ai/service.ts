// ── Assistant service ───────────────────────────────────────────────────────────
// Resolves the active provider from app_settings (falling back to "off"), builds
// the system prompt, and runs a chat turn. The model only ever *routes*: read tools
// run here and feed data back; write tools yield a draft the user must confirm.

import { db } from "../../db";
import { appSettings } from "../../db/schema";
import { eq } from "drizzle-orm";
import { get as getProvider } from "./registry";
import { buildSystemPrompt } from "./context";
import { getTool, toolSpecs } from "./tools";
import type { AiMessage, RunResult, ToolOutcome, Draft } from "./types";

// Import adapters so they self-register.
import "./providers/off";
import "./providers/mock";
import "./providers/ollama";
import "./providers/claude";

function setting(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

export function activeProviderId(): string {
  return setting("ai_provider") || "off";
}

export function getActiveProvider() {
  const p = getProvider(activeProviderId());
  return p && p.configured() ? p : getProvider("off")!;
}

export function isConfigured(): boolean {
  const id = activeProviderId();
  const p = getProvider(id);
  return !!p && id !== "off" && p.configured();
}

export async function runChat(messages: AiMessage[]): Promise<RunResult> {
  const provider = getActiveProvider();
  if (provider.id === "off") return { text: "", drafts: [] };

  const system = buildSystemPrompt();

  const execTool = async (name: string, args: Record<string, unknown>): Promise<ToolOutcome> => {
    const tool = getTool(name);
    if (!tool) return { kind: "result", data: { error: `Unknown tool ${name}` } };
    if (tool.kind === "read") {
      try { return { kind: "result", data: tool.run(args) }; }
      catch (e) { return { kind: "result", data: { error: (e as Error).message } }; }
    }
    // Write tool → build a draft. On failure (e.g. unknown category) feed the error
    // back as data so the model can correct itself; it never auto-commits.
    try { return { kind: "draft", draft: tool.draft(args) }; }
    catch (e) { return { kind: "result", data: { error: (e as Error).message } }; }
  };

  return provider.run({ system, messages, tools: toolSpecs(), execTool, maxSteps: 6 });
}

export function commitDraft(draft: Draft) {
  const tool = getTool(draft.tool);
  if (!tool || tool.kind !== "write") throw new Error("Unknown or non-write tool.");
  return tool.commit(draft.args);
}
