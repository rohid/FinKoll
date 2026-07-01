# Updating FinKoll (keep your data)

This guide replaces the app with a newer version **without losing anything** in
your database. Your data and login live in two places that the update never
touches:

- **`.env`** — your secrets (encryption key, password hash)
- **`data/`** — the encrypted database + automatic backups

The update archive contains **source code only** — it does **not** include
`.env` or `data/`, so they cannot be overwritten by accident.

---

## Before you start — make a safety backup (30 seconds)

Even though the update is designed to be safe, copy the `data/` folder first.
If anything ever looks wrong, you restore this copy and you're back.

- **Linux / macOS:**
  ```bash
  cp -r data data-backup-$(date +%Y%m%d)
  ```
- **Windows (PowerShell):**
  ```powershell
  Copy-Item data "data-backup-$(Get-Date -Format yyyyMMdd)" -Recurse
  ```

> FinKoll also makes its **own** automatic backup of the database every time it
> starts up and before any schema change — those land in `data/backups/`.
> The manual copy above is just extra insurance.

---

## Option A — Docker (recommended)

You have two ways to bring in the new code. **Method 1 is the simplest.**

### Method 1 — Extract over your existing folder

1. Extract this archive **into your existing FinKoll folder**, allowing it to
   overwrite files. Because the archive has no `.env` and no `data/`, your
   secrets and database are left exactly as they are — only the app code is
   replaced.
2. From the project folder, rebuild and restart:
   ```bash
   docker compose up -d --build
   ```

### Method 2 — Fresh folder, copy your data in

Prefer a clean slate (this also removes any files deleted in the new version):

1. Extract the archive into a **new** folder, e.g. `finkoll-new/`.
2. Copy your two live items from the old folder into the new one:
   - **Linux / macOS:**
     ```bash
     cp    finkoll-old/.env       finkoll-new/.env
     cp -r finkoll-old/data       finkoll-new/data
     ```
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item finkoll-old\.env  finkoll-new\.env
     Copy-Item finkoll-old\data  finkoll-new\data -Recurse
     ```
3. From `finkoll-new/`, rebuild and restart:
   ```bash
   docker compose up -d --build
   ```

That's it. On startup the backend automatically:
- makes a pre-update backup of the database, then
- applies any new database migrations.

Check it came up cleanly:
```bash
docker compose logs -f backend
```
Then open **http://localhost** and confirm your data is all there.

---

## Option B — Node.js (no Docker)

1. Bring in the new code using **Method 1 or 2** above (keep your
   `backend/.env` and `data/` — note that in Node mode the config file lives at
   `backend/.env`, not the project root).
2. Reinstall dependencies in case they changed:
   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```
3. Start it again:
   ```bash
   bash scripts/start.sh          # Linux/macOS
   ```
   (Windows: run `npm run dev --prefix backend` and
   `npm run dev --prefix frontend` in two terminals.)

Migrations and the pre-update backup run automatically on start, same as Docker.

---

## If something looks wrong

1. Stop the app: `docker compose down` (or Ctrl-C for Node).
2. Restore your safety copy:
   - `rm -rf data && mv data-backup-YYYYMMDD data` (Linux/macOS)
   - or restore the newest file from `data/backups/`.
3. Start the **previous** version again.

Your `DB_ENCRYPTION_KEY` must stay the same across updates — the database cannot
be opened without it. Never change it when updating.
