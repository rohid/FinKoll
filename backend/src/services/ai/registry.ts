import type { AiProvider } from "./types";

// Providers self-register by id on import. Adding an AI backend = drop in one
// adapter file that calls register(...) — no route/DB/UI change required.
const providers = new Map<string, AiProvider>();

export function register(provider: AiProvider): void {
  providers.set(provider.id, provider);
}

export function get(id: string): AiProvider | undefined {
  return providers.get(id);
}

export function list(): AiProvider[] {
  return [...providers.values()];
}
