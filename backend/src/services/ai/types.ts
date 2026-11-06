// ── AI provider domain model ──────────────────────────────────────────────────
// The conversational assistant talks to a *provider* (local Ollama, cloud Claude,
// a test mock, or none). Routes/UI depend only on these types — the data source is
// swapped by selecting a provider id in Settings (see registry.ts / service.ts),
// exactly like the market-data providers.

export type AiRole = "user" | "assistant";
export interface AiMessage {
  role: AiRole;
  content: string;
}

// A proposed write the user must confirm before it is committed. The model can
// only ever produce a draft — nothing is saved until the user clicks Confirm.
export interface Draft {
  tool: string;
  args: Record<string, unknown>;
  preview: string; // human-readable summary of exactly what will be saved
}

// What execTool() hands back to the provider's tool loop.
export type ToolOutcome =
  | { kind: "result"; data: unknown } // read tool → feed the data back to the model
  | { kind: "draft"; draft: Draft };  // write tool → stop and ask the user to confirm

// Provider-facing tool spec — plain JSON Schema, no zod (kept dependency-free).
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface RunOptions {
  system: string;
  messages: AiMessage[];
  tools: ToolSpec[];
  execTool: (name: string, args: Record<string, unknown>) => Promise<ToolOutcome>;
  maxSteps?: number;
}

export interface RunResult {
  text: string;     // the assistant's final natural-language answer
  drafts: Draft[];  // any pending writes awaiting confirmation
}

export interface AiProvider {
  id: string;
  configured(): boolean;              // is this provider usable right now?
  run(opts: RunOptions): Promise<RunResult>;
}
