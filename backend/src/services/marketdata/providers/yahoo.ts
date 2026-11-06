import YahooFinance from "yahoo-finance2";
import { register } from "../registry";
import type { Provider, HoldingRef, Quote, Fundamental, Candle, SymbolHit } from "../types";

// Free, unofficial market data via yahoo-finance2. Covers Nordic (.ST) + global,
// quotes + FX + fundamentals + history. Quotes are delayed / end-of-day, not
// real-time. Selected when investments_market_provider = "yahoo" (the default).
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// One Yahoo quote() call accepts an array of symbols; map results back by symbol.
async function quoteMany(symbols: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const unique = [...new Set(symbols.filter(Boolean))];
  if (unique.length === 0) return map;
  const res = (await yf.quote(unique)) as any;
  const arr = Array.isArray(res) ? res : [res];
  for (const q of arr) if (q?.symbol) map.set(q.symbol, q);
  return map;
}

function rangeToPeriod1(range: string): Date {
  const now = new Date();
  const m = /^(\d+)\s*([dmy])$/i.exec(range.trim());
  const n = m ? parseInt(m[1]) : 1;
  const unit = m ? m[2].toLowerCase() : "y";
  const d = new Date(now);
  if (unit === "d") d.setDate(d.getDate() - n);
  else if (unit === "m") d.setMonth(d.getMonth() - n);
  else d.setFullYear(d.getFullYear() - (m ? n : 1));
  return d;
}

const yahooProvider: Provider = {
  id: "yahoo",
  capabilities: ["quotes", "fx", "fundamentals", "history", "search"],

  // Resolve a provider symbol from an ISIN when no ticker is stored yet.
  async resolveRef(ref: HoldingRef): Promise<string | null> {
    if (ref.symbol) return ref.symbol;
    const term = ref.isin?.trim();
    if (!term) return null;
    const res: any = await yf.search(term);
    return res.quotes.find((q: any) => q.symbol)?.symbol ?? null;
  },

  async getQuotes(refs: HoldingRef[]): Promise<Quote[]> {
    const withSymbol = refs.filter((r) => r.symbol);
    const quotes = await quoteMany(withSymbol.map((r) => r.symbol!));
    const nowIso = new Date().toISOString();
    const out: Quote[] = [];
    for (const r of withSymbol) {
      const q = quotes.get(r.symbol!);
      if (!q || typeof q.regularMarketPrice !== "number") continue;
      const asOf = q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : nowIso;
      out.push({
        holdingId: r.holdingId,
        price: q.regularMarketPrice,
        currency: q.currency ?? r.currency,
        changePct: q.regularMarketChangePercent ?? 0,
        dayChange: q.regularMarketChange ?? 0,
        asOf,
      });
    }
    return out;
  },

  async getFxToSek(currencies: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = { SEK: 1 };
    const need = [...new Set(currencies)].filter((c) => c && c !== "SEK");
    if (need.length === 0) return out;
    const quotes = await quoteMany(need.map((c) => `${c}SEK=X`));
    for (const c of need) {
      const q = quotes.get(`${c}SEK=X`);
      out[c] = typeof q?.regularMarketPrice === "number" ? q.regularMarketPrice : 1;
    }
    return out;
  },

  async getFundamentals(refs: HoldingRef[]): Promise<Fundamental[]> {
    const asOf = new Date().toISOString();
    const out: Fundamental[] = [];
    for (const r of refs) {
      if (!r.symbol) continue;
      try {
        const s: any = await yf.quoteSummary(r.symbol, {
          modules: ["summaryDetail", "defaultKeyStatistics", "financialData", "price"],
        });
        out.push({
          holdingId: r.holdingId,
          pe: s.summaryDetail?.trailingPE,
          pb: s.defaultKeyStatistics?.priceToBook,
          dividendYield: s.summaryDetail?.dividendYield,
          debtEquity: s.financialData?.debtToEquity,
          marketCap: s.price?.marketCap ?? s.summaryDetail?.marketCap,
          currency: s.price?.currency ?? r.currency,
          asOf,
        });
      } catch {
        // skip instruments Yahoo can't summarise
      }
    }
    return out;
  },

  async search(query: string): Promise<SymbolHit[]> {
    const res: any = await yf.search(query);
    return (res.quotes ?? [])
      .filter((q: any) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND"))
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchDisp ?? q.exchange,
      }));
  },

  async getHistory(ref: HoldingRef, range: string): Promise<Candle[]> {
    if (!ref.symbol) return [];
    const res: any = await yf.chart(ref.symbol, { period1: rangeToPeriod1(range), interval: "1d" });
    return (res.quotes ?? [])
      .filter((q: any) => q.date && typeof q.close === "number")
      .map((q: any) => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close }));
  },
};

register(yahooProvider);
export default yahooProvider;
