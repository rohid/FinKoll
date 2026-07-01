import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "../db/schema";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── Brute-force protection: 5 attempts per 15 min per IP ─────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// Throttle authenticated password changes (defends a stolen session brute-forcing
// the current password against bcrypt).
const changePwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

// ── Account-level lockout ─────────────────────────────────────────────────────
// Single admin account: after MAX_FAILS consecutive failures, block ALL logins
// for LOCK_MS regardless of source IP (defends IP rotation that the per-IP
// limiter can't). In-memory: a remote attacker cannot reset it, and it clears on
// its own after the cooldown.
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000; // 10 minutes
let failCount = 0;
let lockedUntil = 0;

function setSetting(key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

function getPasswordHash(): string | undefined {
  return db.select().from(appSettings).where(eq(appSettings.key, "password_hash")).get()?.value;
}

function clientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
}

// ── Constant-time sentinel hash used when no real hash exists ─────────────────
// Prevents timing attacks that leak whether the user account exists.
const DUMMY_HASH = "$2a$12$zVxF0K3F8Qk5VLbKXzGxJeQRTl4VxJzQKfXxDqOaGQ0JwNnT6HiGS";

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  const ip = clientIp(req);

  // Account-level lockout
  const now = Date.now();
  if (now < lockedUntil) {
    const secs = Math.ceil((lockedUntil - now) / 1000);
    console.warn(`[auth] LOGIN BLOCKED (locked) ip=${ip}`);
    res.status(429).json({
      error: "Account temporarily locked after too many failed attempts. Try again later.",
      retryAfterSeconds: secs,
    });
    return;
  }

  const hash = getPasswordHash() ?? DUMMY_HASH;

  // Always run bcrypt — prevents timing side-channel that leaks valid usernames
  const valid = typeof username === "string"
    && typeof password === "string"
    && username === process.env.ADMIN_USERNAME
    && await bcrypt.compare(password, hash)
    && hash !== DUMMY_HASH; // reject if no real hash configured

  if (!valid) {
    failCount++;
    if (failCount >= MAX_FAILS) {
      lockedUntil = Date.now() + LOCK_MS;
      failCount = 0;
      console.warn(`[auth] ACCOUNT LOCKED for 10 min after ${MAX_FAILS} failures ip=${ip}`);
    }
    console.warn(`[auth] LOGIN FAILED  ip=${ip} user=${username ?? "(none)"} (fail ${failCount}/${MAX_FAILS})`);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Success — clear the failure state
  failCount = 0;
  lockedUntil = 0;
  console.info(`[auth] LOGIN SUCCESS ip=${ip} user=${username}`);

  const token = jwt.sign({ sub: username }, process.env.JWT_SECRET!, { expiresIn: "8h" });

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ ok: true });
});

router.post("/logout", (req: Request, res: Response) => {
  console.info(`[auth] LOGOUT ip=${clientIp(req)}`);
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", requireAuth, (_req: Request, res: Response) => {
  res.json({ username: process.env.ADMIN_USERNAME });
});

router.post("/change-password", changePwLimiter, requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }

  const hash = getPasswordHash();
  if (!hash) {
    res.status(500).json({ error: "No password configured." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, hash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  db.update(appSettings)
    .set({ value: newHash })
    .where(eq(appSettings.key, "password_hash"))
    .run();

  // Invalidate every session issued before now (logout-everywhere): requireAuth
  // rejects tokens whose `iat` predates this timestamp.
  const nowSec = Math.floor(Date.now() / 1000);
  setSetting("password_changed_at", String(nowSec));

  // Keep THIS session alive by issuing a fresh token (its iat is >= the stamp).
  const token = jwt.sign({ sub: process.env.ADMIN_USERNAME }, process.env.JWT_SECRET!, { expiresIn: "8h" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ ok: true });
});

export default router;
