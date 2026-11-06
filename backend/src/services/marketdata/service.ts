import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { appSettings, holdingProviderSymbols } from "../../db/schema";
import * as registry from "./registry";
import type { Capability, HoldingRef, Quote, Fundamental, Candle, ImportedPosition, SymbolHit } from "./types";

// Import the built-in providers so they self-register. Optional/keyed providers
// (e.g. a local-only Nordnet adapter) would be added here behind a guarded import.
import "./providers/manual";
import "./providers/yahoo";

const MARKET_KEY = "investments_market_provider";
const PORTFOLIO_KEY = "investments_portfolio_provider";
const DEFAULT_MARKET = "yahoo";
const DEFAULT_PORTFOLIO = "manual";

function setting(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

function marketId(): string {
  return process.env.MARKETDATA_PROVIDER || setting(MARKET_KEY) || DEFAULT_MARKET;
}
function portfolioId(): string {
  return process.env.PORTFOLIO_PROVIDER || setting(PORTFOLIO_KEY) || DEFAULT_PORTFOLIO;
}

// Always resolve to *some* provider; fall back to manual so the app never hard-fails
// when a configured provider id is unknown (e.g. a local-only adapter isn't present).
function market() {
  return registry.get(marketId()) ?? registry.get("manual")!;
}
function portfolio() {
  return registry.get(portfolioId()) ?? registry.get("manual")!;
}

// Fill each ref's provider symbol: use the stored symbol, else a cached resolution,
// else ask the provider to resolve from ISIN and cache it.
async function resolveSymbols(refs: HoldingRef[]): Promise<HoldingRef[]> {
  const p = market();
  const out: HoldingRef[] = [];
  for (const r of refs) {
    if (r.symbol) { out.push(r); continue; }
    const cached = db
      .select()
      .from(holdingProviderSymbols)
      .where(and(eq(holdingProviderSymbols.holdingId, r.holdingId), eq(holdingProviderSymbols.providerId, p.id)))
      .get();
    if (cached) { out.push({ ...r, symbol: cached.symbol }); continue; }
    const resolved = p.resolveRef ? await p.resolveRef(r).catch(() => null) : null;
    if (resolved) {
      db.insert(holdingProviderSymbols)
        .values({ holdingId: r.holdingId, providerId: p.id, symbol: resolved, resolvedAt: new Date().toISOString() })
        .run();
      out.push({ ...r, symbol: resolved });
    } else {
      out.push(r);
    }
  }
  return out;
}

export async function getQuotes(refs: HoldingRef[]): Promise<Quote[]> {
  const p = market();
  if (!p.getQuotes) return [];
  return p.getQuotes(await resolveSymbols(refs));
}

export async function getFxToSek(currencies: string[]): Promise<Record<string, number>> {
  const p = market();
  if (!p.getFxToSek) return Object.fromEntries(currencies.map((c) => [c, 1]));
  return p.getFxToSek(currencies);
}

export async function getFundamentals(refs: HoldingRef[]): Promise<Fundamental[]> {
  const p = market();
  if (!p.getFundamentals) return [];
  return p.getFundamentals(await resolveSymbols(refs));
}

export async function getHistory(ref: HoldingRef, range: string): Promise<Candle[]> {
  const p = market();
  if (!p.getHistory) return [];
  const [resolved] = await resolveSymbols([ref]);
  return p.getHistory(resolved, range);
}

export async function search(query: string): Promise<SymbolHit[]> {
  const p = market();
  if (!p.search) return [];
  return p.search(query);
}

export async function syncPositions(): Promise<ImportedPosition[]> {
  const p = portfolio();
  if (!p.syncPositions) return [];
  return p.syncPositions();
}

// Capabilities of the active providers, for GET /api/investments/providers.
export function describeProviders(): {
  market: string; portfolio: string;
  capabilities: Capability[]; portfolioCapabilities: Capability[];
} {
  return {
    market: market().id,
    portfolio: portfolio().id,
    capabilities: market().capabilities,
    portfolioCapabilities: portfolio().capabilities,
  };
}
