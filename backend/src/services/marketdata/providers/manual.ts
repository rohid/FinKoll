import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { appSettings } from "../../../db/schema";
import { register } from "../registry";
import type { Provider, HoldingRef, Quote } from "../types";

// Offline / privacy provider: prices come from the holding's manual price, FX from
// an optional user-set map. Makes NO network calls. Selected when
// investments_market_provider = "manual".
const MANUAL_FX_KEY = "investments_manual_fx"; // JSON e.g. {"USD":10.5,"EUR":11.4}

function manualFx(): Record<string, number> {
  const row = db.select().from(appSettings).where(eq(appSettings.key, MANUAL_FX_KEY)).get();
  if (!row) return {};
  try {
    const obj = JSON.parse(row.value);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

const manualProvider: Provider = {
  id: "manual",
  capabilities: ["quotes", "fx"],

  async getQuotes(refs: HoldingRef[]): Promise<Quote[]> {
    const asOf = new Date().toISOString();
    return refs.map((r) => ({
      holdingId: r.holdingId,
      price: r.manualPrice ?? 0,
      currency: r.currency,
      changePct: 0,
      dayChange: 0,
      asOf,
    }));
  },

  async getFxToSek(currencies: string[]): Promise<Record<string, number>> {
    const fx = manualFx();
    const out: Record<string, number> = {};
    for (const c of currencies) out[c] = c === "SEK" ? 1 : fx[c] ?? 1;
    return out;
  },
};

register(manualProvider);
export default manualProvider;
