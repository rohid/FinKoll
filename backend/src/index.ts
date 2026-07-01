import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";
import { sqlite } from "./db";
import { seed } from "./db/seed";
import { requireAuth } from "./middleware/auth";
import { createBackup, backupBeforeMigrate } from "./services/backup";

import authRoutes from "./routes/auth";
import categoriesRoutes from "./routes/categories";
import transactionsRoutes from "./routes/transactions";
import budgetRoutes from "./routes/budget";
import recurringRoutes from "./routes/recurring";
import summaryRoutes from "./routes/summary";
import electricityRoutes from "./routes/electricity";
import backupRoutes from "./routes/backup";
import appSettingsRoutes from "./routes/settings";
import locksRoutes    from "./routes/locks";
import insightsRoutes from "./routes/insights";
import mortgagesRoutes from "./routes/mortgages";
import sqlRoutes from "./routes/sql";
import importRoutes from "./routes/import";
import worksheetsRoutes from "./routes/worksheets";

// ── Startup environment validation ────────────────────────────────────────────
const REQUIRED_ENV: Record<string, (v: string) => string | null> = {
  JWT_SECRET:          (v) => v.length < 32 ? "JWT_SECRET must be at least 32 characters" : null,
  DB_ENCRYPTION_KEY:   (v) => v.length !== 32 ? "DB_ENCRYPTION_KEY must be exactly 32 characters" : null,
  ADMIN_USERNAME:      (v) => v.length < 1 ? "ADMIN_USERNAME is required" : null,
  FRONTEND_URL:        (v) => v.length < 1 ? "FRONTEND_URL is required" : null,
};

for (const [key, validate] of Object.entries(REQUIRED_ENV)) {
  const val = process.env[key] ?? "";
  if (!val) { console.error(`[startup] FATAL: ${key} is not set`); process.exit(1); }
  const err = validate(val);
  if (err)  { console.error(`[startup] FATAL: ${err}`);             process.exit(1); }
}

const FRONTEND_URL = process.env.FRONTEND_URL!;

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// Behind nginx (a single trusted hop): trust its X-Forwarded-For so req.ip is the
// real client IP. Without this, express-rate-limit keys every request on nginx's
// IP — collapsing per-IP login limits into one global bucket.
app.set("trust proxy", 1);

app.use(helmet({
  // Allow the SPA served from the same origin to make API calls
  contentSecurityPolicy: false, // nginx handles CSP for the frontend
}));

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
// Worksheets carry a serialized spreadsheet, which can exceed the default
// limit — give that path a larger JSON parser before the global (smaller) one.
app.use("/api/worksheets", express.json({ limit: "2mb" }));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

// Public
app.use("/api/auth", authRoutes);

// Protected
app.use("/api/categories", requireAuth, categoriesRoutes);
app.use("/api/transactions", requireAuth, transactionsRoutes);
app.use("/api/budget", requireAuth, budgetRoutes);
app.use("/api/recurring", requireAuth, recurringRoutes);
app.use("/api/summary", requireAuth, summaryRoutes);
app.use("/api/electricity", requireAuth, electricityRoutes);
app.use("/api/backup",   requireAuth, backupRoutes);
app.use("/api/settings", requireAuth, appSettingsRoutes);
app.use("/api/locks",     requireAuth, locksRoutes);
app.use("/api/insights",  requireAuth, insightsRoutes);
app.use("/api/mortgages", requireAuth, mortgagesRoutes);
app.use("/api/sql",       requireAuth, sqlRoutes);
app.use("/api/import",    requireAuth, importRoutes);
app.use("/api/worksheets", requireAuth, worksheetsRoutes);

// Run migrations inline on startup, then seed
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db";
import path from "path";

// SAFETY: snapshot the database before any migration can alter it.
// This runs on every container start, so each `docker compose up` keeps a
// pre-update backup that survives even if a migration later goes wrong.
try {
  const snapshot = backupBeforeMigrate();
  if (snapshot) console.log(`[backup] pre-update snapshot created: ${snapshot}`);
} catch (err) {
  console.error("[backup] pre-update snapshot FAILED — aborting startup to protect data:", err);
  process.exit(1); // refuse to migrate without a safety backup
}

try {
  migrate(db, { migrationsFolder: path.resolve(__dirname, "db/migrations") });
  seed();
} catch (err) {
  console.error("Migration/seed error:", err);
}

// Scheduled backups
// Daily at 02:00 — label as "weekly" on Sundays, "daily" otherwise
cron.schedule("0 2 * * *", async () => {
  const isSunday = new Date().getDay() === 0;
  const label = isSunday ? "weekly" : "daily";
  try {
    const entry = await createBackup(label);
    console.log(`[backup] ${label} backup created: ${entry.filename}`);
  } catch (err) {
    console.error("[backup] scheduled backup failed:", err);
  }
});

const PORT = process.env.PORT ?? 3001;
const server = app.listen(PORT, () => {
  console.log(`FinKoll API v${process.env.npm_package_version ?? "1.0.0"} running on http://localhost:${PORT}`);
  console.log(`[backup] Scheduled: daily at 02:00 (weekly label on Sundays), keeping 7 backups`);
});

process.on("SIGTERM", () => {
  server.close(() => sqlite.close());
});
