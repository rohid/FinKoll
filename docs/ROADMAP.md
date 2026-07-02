# FinKoll Roadmap

Where FinKoll is headed. This is a direction of travel, not a commitment or a
schedule — items may change, reorder, or drop. Community input via GitHub Issues
is welcome.

**Current release: [1.0.0](../CHANGELOG.md)** — the full self-hosted budgeting
app: monthly/yearly budgeting, analytics, electricity, mortgage, worksheets,
import, multilingual + mobile-responsive UI, encrypted storage, backups.

---

## Near term (1.x — incremental, backwards-compatible)

- **Worksheet export** — download a worksheet as CSV/XLSX; import a range from a file.
- **Worksheet templates** — ready-made sheets (house purchase incl. Swedish
  *lagfart*/*pantbrev*, trip budget, loan comparison).
- **Enhanced analytics** — net-worth over time, category trend detection,
  year-over-year comparison, budget-adherence scoring, customizable date ranges.
- **PWA / installable** — "Add to Home Screen", offline shell, app icon.
- **More languages** — extend the EN/SV/ES base (community-contributed locales).
- **Dashboard customization** — choose/reorder cards and widgets.

## Mid term (2.x — larger features)

- **Native mobile app (Apple-first)** — iOS/iPadOS client over the existing API,
  Face ID unlock, home-screen widgets; Android to follow. The current
  responsive UI is the design foundation.
- **Multi-user / household accounts** — more than one login, per-user views,
  optional roles, shared vs. private categories.
- **Richer forecasting** — scenario planning, goal tracking (savings targets with
  projected completion dates), what-if on income/expense changes.
- **Attachments** — receipts/notes attached to transactions.

## Integrations (opt-in, privacy-preserving)

- **Bank import** — PSD2/open-banking aggregation (e.g. Tink/GoCardless/Nordigen)
  to pull transactions automatically, with local categorization.
- **Tibber API** — auto-fill the electricity module (consumption + price) instead
  of manual entry.
- **Electricity price feeds** — spot-price APIs (e.g. Nord Pool / elprisetjustnu)
  for estimates and comparisons.
- **Export / accounting** — scheduled CSV/JSON export, and optional push to a
  spreadsheet or accounting tool.

## Platform & quality (ongoing)

- **Automated tests** — expand unit + Playwright end-to-end coverage (the
  screenshot tooling is a starting point).
- **Dependency hygiene** — track and migrate off flagged/vulnerable packages.
- **Accessibility** — keyboard navigation and screen-reader passes.
- **One-command deploy** — tighten the Docker + TLS + cloud story (see
  [deployment docs](deployment/)).

---

### Guiding principles

1. **Local-first & private** — your data stays in your encrypted database; any
   integration is opt-in and clearly scoped.
2. **Self-hostable** — always runnable on a Raspberry Pi with Docker; no
   mandatory cloud service.
3. **Backwards-compatible data** — upgrades never lose data; schema changes ship
   automatic, backed-up migrations.

Have an idea or a priority? Open an issue on
[GitHub](https://github.com/rohid/FinKoll/issues).
