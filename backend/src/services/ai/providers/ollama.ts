import { register } from "../registry";
import { db } from "../../../db";
import { appSettings } from "../../../db/schema";
import { eq } from "drizzle-orm";
import type { RunOptions, RunResult, Draft } from "../types";

function cfg(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

// Local model via Ollama's /api/chat with native tool-calling. The model runs on
// whatever box the user points ai_base_url at; data never leaves their network.
register({
  id: "ollama",
  configured: () => !!(cfg("ai_base_url") && cfg("ai_model")),
  run: async ({ system, messages, tools, execTool, maxSteps = 6 }: RunOptions): Promise<RunResult> => {
    const base = (cfg("ai_base_url") || "http://localhost:11434").replace(/\/$/, "");
    const model = cfg("ai_model") || "qwen2.5:3b";
    const msgs: Record<string, unknown>[] = [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const oTools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    const drafts: Draft[] = [];

    for (let step = 0; step < maxSteps; step++) {
      const resp = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // temperature 0 → faithful, deterministic relaying of tool figures. num_ctx
        // 8192 so the system prompt + schema + tool results aren't truncated (Ollama's
        // default context is small); fits a 7B on an 8GB GPU.
        body: JSON.stringify({ model, messages: msgs, tools: oTools, stream: false, options: { temperature: 0, num_ctx: 8192 } }),
      });
      if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json() as { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] } };
      const msg = data.message ?? {};
      const calls = msg.tool_calls ?? [];
      if (!calls.length) return { text: msg.content ?? "", drafts };

      msgs.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      let stop = false;
      for (const c of calls) {
        const name = c.function?.name ?? "";
        let args = c.function?.arguments ?? {};
        if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
        const outcome = await execTool(name, args as Record<string, unknown>);
        if (outcome.kind === "draft") {
          drafts.push(outcome.draft);
          msgs.push({ role: "tool", content: `Draft prepared, awaiting the user's confirmation: ${outcome.draft.preview}` });
          stop = true;
        } else {
          msgs.push({ role: "tool", content: JSON.stringify(outcome.data) });
        }
      }
      if (stop) return { text: msg.content ?? "", drafts };
    }
    return { text: "", drafts };
  },
});
