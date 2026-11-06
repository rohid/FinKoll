import { Router, Request, Response } from "express";
import { db } from "../db";
import { holdings, holdingQuotes, portfolioSnapshots, fundamentals } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as market from "../services/marketdata/service";
import type { HoldingRef } from "../services/marketdata/types";

const router = Router();

const HoldingSchema = z.object({
  name:        z.string().min(1),
  isin:        z.string().optional(),
  symbol:      z.string().optional(),
  assetType:   z.enum(["STOCK", "FUND", "ETF", "OTHER"]).default("STOCK"),
  quantity:    z.number().nonnegative(),
  avgCost:     z.number().nonnegative(),
  currency:    z.string().min(1).default("SEK"),
  manualPrice: z.number().positive().optional(),
  sortOrder:   z.number().int().optional(),
  notes:       z.string().optional(),
});

type HoldingRow = typeof holdings.$inferSelect;
type QuoteRow = typeof holdingQuotes.$inferSelect;

// Enrich a holding with its cached quote → market value, cost, and gain/loss in SEK.
// Everything is recomputed live from the current quantity so edits take effect at once;
// the cached quote supplies price, FX, and day change.
function enrich(h: HoldingRow, q: QuoteRow | undefined) {
  const price   = q?.price ?? h.manualPrice ?? 0;
  const fx      = q?.fxToSek ?? 1;
  const marketValueSek = h.quantity * price * fx;
  const costSek        = h.quantity * h.avgCost * fx;
  const gainSek        = marketValueSek - costSek;
  const dayChangeSek   = h.quantity * (q?.dayChange ?? 0) * fx;
  return {
    ...h,
    price,
    quoteCurrency: q?.currency ?? h.currency,
    changePct:     q?.changePct ?? 0,
    dayChangeSek,
    fxToSek:       fx,
    marketValueSek,
    costSek,
    gainSek,
    gainPct: costSek > 0 ? (gainSek / costSek) * 100 : 0,
    asOf:    q?.asOf ?? null,
  };
}

function loadEnriched() {
  const rows = db.select().from(holdings).orderBy(holdings.sortOrder, holdings.name).all();
  const quotes = new Map(db.select().from(holdingQuotes).all().map((q) => [q.holdingId, q]));
  return rows.map((h) => enrich(h, quotes.get(h.id)));
}

// Percentage return over `daysAgo` from an ascending-by-date candle series.
function pctReturn(candles: { date: string; close: number }[], daysAgo: number): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1].close;
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = target.toISOString().slice(0, 10);
  const past = candles.find((c) => c.date >= targetStr) ?? candles[0];
  if (!past.close) return null;
  return ((last - past.close) / past.close) * 100;
}

// ── Quote refresh + snapshot (also used by the daily cron) ─────────────────────
export async function refreshQuotes(): Promise<number> {
  const rows = db.select().from(holdings).all();
  if (rows.length === 0) return 0;

  const refs: HoldingRef[] = rows.map((h) => ({
    holdingId: h.id, isin: h.isin, symbol: h.symbol, currency: h.currency, manualPrice: h.manualPrice,
  }));

  const quotes = await market.getQuotes(refs);
  const quoteByHolding = new Map(quotes.map((q) => [q.holdingId, q]));
  const currencies = [...new Set([...rows.map((h) => h.currency), ...quotes.map((q) => q.currency)])];
  const fx = await market.getFxToSek(currencies);

  const asOf = new Date().toISOString();
  let n = 0;
  for (const h of rows) {
    const q = quoteByHolding.get(h.id);
    const price = q?.price ?? h.manualPrice;
    if (price == null) continue; // nothing to record yet
    const ccy = q?.currency ?? h.currency;
    const fxToSek = fx[ccy] ?? 1;
    db.insert(holdingQuotes)
      .values({
        holdingId: h.id, price, currency: ccy,
        changePct: q?.changePct ?? 0, dayChange: q?.dayChange ?? 0,
        fxToSek, marketValueSek: h.quantity * price * fxToSek, asOf: q?.asOf ?? asOf,
      })
      .onConflictDoUpdate({
        target: holdingQuotes.holdingId,
        set: {
          price, currency: ccy, changePct: q?.changePct ?? 0, dayChange: q?.dayChange ?? 0,
          fxToSek, marketValueSek: h.quantity * price * fxToSek, asOf: q?.asOf ?? asOf,
        },
      })
      .run();
    n++;
  }
  return n;
}

// Write (or replace) today's total-portfolio snapshot for the performance chart.
export function writeSnapshot(): void {
  const enriched = loadEnriched();
  const totalValueSek = enriched.reduce((s, h) => s + h.marketValueSek, 0);
  const totalCostSek  = enriched.reduce((s, h) => s + h.costSek, 0);
  const date = new Date().toISOString().slice(0, 10);
  db.insert(portfolioSnapshots)
    .values({ date, totalValueSek, totalCostSek, gainSek: totalValueSek - totalCostSek })
    .onConflictDoUpdate({
      target: portfolioSnapshots.date,
      set: { totalValueSek, totalCostSek, gainSek: totalValueSek - totalCostSek },
    })
    .run();
}

// Fetch + store fundamentals (P/E, P/B, yield, debt/equity, market cap) per holding.
// No-op when the active provider can't supply fundamentals.
export async function refreshFundamentals(): Promise<number> {
  const caps = market.describeProviders().capabilities;
  if (!caps.includes("fundamentals")) return 0;
  const rows = db.select().from(holdings).all();
  if (rows.length === 0) return 0;

  const refs: HoldingRef[] = rows.map((h) => ({
    holdingId: h.id, isin: h.isin, symbol: h.symbol, currency: h.currency, manualPrice: h.manualPrice,
  }));
  const funds = await market.getFundamentals(refs);
  let n = 0;
  for (const f of funds) {
    const values = {
      holdingId: f.holdingId, pe: f.pe ?? null, pb: f.pb ?? null,
      dividendYield: f.dividendYield ?? null, debtEquity: f.debtEquity ?? null,
      marketCap: f.marketCap ?? null, currency: f.currency ?? null, asOf: f.asOf,
    };
    db.insert(fundamentals).values(values)
      .onConflictDoUpdate({ target: fundamentals.holdingId, set: values })
      .run();
    n++;
  }
  return n;
}

export async function refreshAndSnapshot(): Promise<number> {
  const n = await refreshQuotes();
  await refreshFundamentals().catch(() => 0); // fundamentals are best-effort
  writeSnapshot();
  return n;
}

// ── Routes ─────────────────────────────────────────────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  res.json(loadEnriched());
});

router.get("/summary", (_req: Request, res: Response) => {
  const enriched = loadEnriched();
  const totalValueSek = enriched.reduce((s, h) => s + h.marketValueSek, 0);
  const totalCostSek  = enriched.reduce((s, h) => s + h.costSek, 0);
  const dayChangeSek  = enriched.reduce((s, h) => s + h.dayChangeSek, 0);
  const gainSek = totalValueSek - totalCostSek;
  const asOfs = enriched.map((h) => h.asOf).filter(Boolean) as string[];
  res.json({
    totalValueSek, totalCostSek, gainSek,
    gainPct: totalCostSek > 0 ? (gainSek / totalCostSek) * 100 : 0,
    dayChangeSek,
    dayChangePct: totalValueSek - dayChangeSek > 0 ? (dayChangeSek / (totalValueSek - dayChangeSek)) * 100 : 0,
    count: enriched.length,
    asOf: asOfs.length ? asOfs.sort().slice(-1)[0] : null,
    ...market.describeProviders(),
  });
});

router.get("/history", (_req: Request, res: Response) => {
  res.json(db.select().from(portfolioSnapshots).orderBy(portfolioSnapshots.date).all());
});

router.get("/providers", (_req: Request, res: Response) => {
  res.json(market.describeProviders());
});

// Category analysis: fundamentals per holding, plus optional 1M/3M/1Y returns
// (computed from price history; only when ?withReturns=1 to bound provider calls).
router.get("/analysis", async (req: Request, res: Response) => {
  const withReturns = req.query.withReturns === "1" || req.query.withReturns === "true";
  const enriched = loadEnriched();
  const fundMap = new Map(db.select().from(fundamentals).all().map((f) => [f.holdingId, f]));

  const returnsMap = new Map<number, { r1m: number | null; r3m: number | null; r1y: number | null }>();
  if (withReturns && market.describeProviders().capabilities.includes("history")) {
    const rows = db.select().from(holdings).all();
    await Promise.all(rows.map(async (h) => {
      if (!h.symbol && !h.isin) return;
      try {
        const candles = await market.getHistory(
          { holdingId: h.id, isin: h.isin, symbol: h.symbol, currency: h.currency }, "1y",
        );
        returnsMap.set(h.id, { r1m: pctReturn(candles, 30), r3m: pctReturn(candles, 90), r1y: pctReturn(candles, 365) });
      } catch { /* skip instruments without history */ }
    }));
  }

  const holdingsOut = enriched.map((h) => {
    const f = fundMap.get(h.id);
    const r = returnsMap.get(h.id) ?? {};
    return {
      id: h.id, name: h.name, symbol: h.symbol, currency: h.quoteCurrency,
      marketValueSek: h.marketValueSek, gainPct: h.gainPct, dayChangePct: h.changePct,
      pe: f?.pe ?? null, pb: f?.pb ?? null, dividendYield: f?.dividendYield ?? null,
      debtEquity: f?.debtEquity ?? null, marketCap: f?.marketCap ?? null,
      r1m: (r as any).r1m ?? null, r3m: (r as any).r3m ?? null, r1y: (r as any).r1y ?? null,
      fundamentalsAsOf: f?.asOf ?? null,
    };
  });
  res.json({ holdings: holdingsOut, ...market.describeProviders() });
});

router.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) { res.json([]); return; }
  try {
    res.json(await market.search(q));
  } catch (err) {
    res.status(502).json({ error: "search failed", detail: String(err) });
  }
});

router.post("/refresh", async (_req: Request, res: Response) => {
  try {
    const refreshed = await refreshAndSnapshot();
    res.json({ refreshed, ...market.describeProviders() });
  } catch (err) {
    res.status(502).json({ error: "refresh failed", detail: String(err) });
  }
});

router.post("/", (req: Request, res: Response) => {
  const parsed = HoldingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.insert(holdings).values(parsed.data).returning().get();
  res.status(201).json(enrich(row, undefined));
});

router.put("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const parsed = HoldingSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const row = db.update(holdings).set(parsed.data).where(eq(holdings.id, id)).returning().get();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const q = db.select().from(holdingQuotes).where(eq(holdingQuotes.holdingId, id)).get();
  res.json(enrich(row, q));
});

router.delete("/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  db.delete(holdings).where(eq(holdings.id, id)).run();
  res.json({ ok: true });
});

export default router;
