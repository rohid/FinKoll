// ── Market-data domain model ──────────────────────────────────────────────────
// Every provider maps its vendor-specific shapes onto these FinKoll types. Routes,
// the DB, and the UI depend ONLY on these — never on a vendor's JSON — so the data
// source can be swapped by dropping in one adapter file (see registry.ts / service.ts).

export type Capability = "quotes" | "fx" | "fundamentals" | "history" | "search" | "portfolioSync";

export interface SymbolHit {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
}

// What the service hands a provider to identify an instrument. `isin` is the stable
// cross-provider key; `symbol` is the provider-facing ticker. `holdingId` lets a
// provider echo results back to the right holding.
export interface HoldingRef {
  holdingId: number;
  isin?: string | null;
  symbol?: string | null;
  currency: string;
  manualPrice?: number | null;
}

export interface Quote {
  holdingId: number;
  price: number;        // per share, native currency
  currency: string;
  changePct: number;    // day change %
  dayChange: number;    // day change, native per share
  asOf: string;         // ISO timestamp
}

export interface Fundamental {
  holdingId: number;
  pe?: number;
  pb?: number;
  dividendYield?: number;   // fraction, e.g. 0.037
  debtEquity?: number;
  marketCap?: number;
  currency?: string;
  asOf: string;
}

export interface Candle {
  date: string;   // YYYY-MM-DD
  close: number;
}

// Future PortfolioSource (e.g. Nordnet) hands back positions in this shape.
export interface ImportedPosition {
  isin?: string | null;
  symbol?: string | null;
  name: string;
  quantity: number;
  avgCost: number;
  currency: string;
}

export interface Provider {
  id: string;                    // "yahoo" | "manual" | future "nordnet" / "borsdata"
  capabilities: Capability[];
  resolveRef?(ref: HoldingRef): Promise<string | null>;             // ISIN → provider symbol
  getQuotes?(refs: HoldingRef[]): Promise<Quote[]>;
  getFxToSek?(currencies: string[]): Promise<Record<string, number>>;
  getFundamentals?(refs: HoldingRef[]): Promise<Fundamental[]>;
  getHistory?(ref: HoldingRef, range: string): Promise<Candle[]>;
  search?(query: string): Promise<SymbolHit[]>;
  syncPositions?(): Promise<ImportedPosition[]>;
}
