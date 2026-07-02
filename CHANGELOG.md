# Changelog

All notable changes to FinKoll are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Mortgage **payment forecast**: plan future changes to the rate and/or the fixed
  monthly amortization, see the impact on monthly payment, total interest, and
  payoff time, and **save the forecast** (persisted per mortgage).

### Changed
- Mortgage now uses a **fixed-amortization** model throughout (total = interest +
  fixed monthly amortization); the summary card and forecast speak one model.
- The manual mortgage field is now the **monthly amortization** (excl. interest),
  not a full-payment override.

### Migrations
- `0009_mortgage_forecast` — adds a nullable `forecast` column to `mortgages`
  (runs automatically on startup after a pre-migration backup).

## [1.0.0] — 2026-07-01

First public release.

### Added
- Monthly & yearly budgeting with planned-vs-actual variance and net result
- Recurring templates (monthly / quarterly / semi-annual / yearly)
- Analytics: forecast, savings breakdown, category trends, and an electricity section
- Electricity module — Tibber-centric, auto-calculating, multi-house, EV share
- Mortgage tracker with rate-change scenarios
- Worksheets — custom spreadsheets (HyperFormula) with a live FinKoll-data bridge
- CSV import with remembered category mapping
- Read-only-friendly SQL console
- Multilingual UI (English, Swedish, Spanish) with browser-locale auto-detection
- Mobile-responsive layout (bottom tab bar + drawer)
- AES-256 encrypted database, JWT auth in httpOnly cookies, login lockout & rate limiting
- Automatic daily/weekly backups with pre-migration snapshots
- Interactive first-run setup script (`scripts/setup.sh` / `setup.ps1`)
- Docs: Getting Started (EN/SV/ES), visual runthrough, TLS/Let's Encrypt, cloud hosting, roadmap

[Unreleased]: https://github.com/rohid/FinKoll/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rohid/FinKoll/releases/tag/v1.0.0
