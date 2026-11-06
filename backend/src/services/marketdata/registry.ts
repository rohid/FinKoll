import type { Provider } from "./types";

// Providers self-register by id on import. Adding a data source = drop in one
// adapter file that calls register(...) — no route/DB/UI change required.
const providers = new Map<string, Provider>();

export function register(provider: Provider): void {
  providers.set(provider.id, provider);
}

export function get(id: string): Provider | undefined {
  return providers.get(id);
}

export function list(): Provider[] {
  return [...providers.values()];
}
