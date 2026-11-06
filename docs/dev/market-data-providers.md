# Market-data providers

Investments get quotes, FX, fundamentals, and history through a small **pluggable
provider** layer, so the data source can be swapped with a one-file change — no
route, DB, or UI edits. This is deliberate: if Nordnet reopens its API, or Börsdata
becomes affordable, or you want an official paid feed, you add an adapter and select
it in settings.

## How it fits together

- `backend/src/services/marketdata/types.ts` — the FinKoll domain model (`Quote`,
  `Fundamental`, `Candle`, `ImportedPosition`, `SymbolHit`) and the `Provider`
  interface. Everything else depends only on these types, never on a vendor's JSON.
- `registry.ts` — providers self-register by id (`register(...)`).
- `providers/yahoo.ts` — default: Yahoo Finance via `yahoo-finance2` (free, no key;
  quotes/FX/fundamentals/history/search; delayed/EOD).
- `providers/manual.ts` — offline/private: prices you enter, optional manual FX.
- `service.ts` — picks the active market/portfolio provider from `app_settings`
  (`investments_market_provider` / `investments_portfolio_provider`, env overrides
  `MARKETDATA_PROVIDER` / `PORTFOLIO_PROVIDER`), resolves symbols from ISIN, and is
  the only thing the routes call.

## Key ideas that make swapping cheap

1. **Stable domain model** — each adapter maps its vendor shapes onto FinKoll types.
2. **ISIN is the cross-provider key** — `holdings.isin` is stable; each provider
   resolves its own `symbol` from it (cached in `holding_provider_symbols`), so
   switching providers doesn't force re-entering tickers.
3. **Capability flags** — a provider declares `capabilities`; the UI only shows what
   the active provider supports (via `GET /api/investments/providers`).

## Add or replace a provider

1. Create `backend/src/services/marketdata/providers/<id>.ts`.
2. Implement `Provider`: set `id` + `capabilities`, and the methods you support
   (`getQuotes`, `getFxToSek`, `resolveRef`, `getFundamentals`, `getHistory`,
   `search`, and/or `syncPositions`). **Map vendor data to the domain types.**
3. `register(myProvider)` at the bottom, and add `import "./providers/<id>";` to
   `service.ts` (guard it behind an env/key check if it's optional or key-gated).
4. Select it: set `investments_market_provider` (or `investments_portfolio_provider`)
   to your `id` in Settings, or via the env override.

Keep secrets in `.env` (never in `.env.example`). A local-only adapter (e.g. a
personal broker connector) can be gitignored and imported with a guarded dynamic
import so a public checkout without it still runs manual-only.
