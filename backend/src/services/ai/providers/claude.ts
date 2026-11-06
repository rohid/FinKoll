import { register } from "../registry";
import { db } from "../../../db";
import { appSettings } from "../../../db/schema";
import { eq } from "drizzle-orm";
import type { RunOptions, RunResult, Draft } from "../types";

function cfg(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

// Cloud model via the Anthropic Messages API (raw HTTP, to keep this self-hosted
// backend dependency-free and both adapters uniform — the claude-api skill's usual
// choice is the official SDK). The user's question, context and query results are
// sent to Anthropic; the raw DB and the key are not.
register({
  id: "claude",
  configured: () => !!cfg("ai_api_key"),
  run: async ({ system, messages, tools, execTool, maxSteps = 6 }: RunOptions): Promise<RunResult> => {
    const apiKey = cfg("ai_api_key") || "";
    const model = cfg("ai_model") || "claude-haiku-5-5";
    const aTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const msgs: Record<string, unknown>[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const drafts: Draft[] = [];

    for (let step = 0; step < maxSteps; step++) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 2048, system, tools: aTools, messages: msgs }),
      });
      if (!resp.ok) throw new Error(`Claude error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json() as { content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; stop_reason?: string };
      const content = data.content ?? [];
      const textOut = content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const toolUses = content.filter((b) => b.type === "tool_use");
      if (!toolUses.length) return { text: textOut, drafts };

      msgs.push({ role: "assistant", content });
      const results: Record<string, unknown>[] = [];
      let stop = false;
      for (const tu of toolUses) {
        const outcome = await execTool(tu.name ?? "", (tu.input ?? {}) as Record<string, unknown>);
        if (outcome.kind === "draft") {
          drafts.push(outcome.draft);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `Draft prepared, awaiting the user's confirmation: ${outcome.draft.preview}` });
          stop = true;
        } else {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.data) });
        }
      }
      msgs.push({ role: "user", content: results });
      if (stop) return { text: textOut, drafts };
    }
    return { text: "", drafts };
  },
});
