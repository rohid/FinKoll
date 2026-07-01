import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appSettings } from "../db/schema";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; iat?: number };

    // Logout-everywhere: reject tokens issued before the last password change.
    const changedAt = db.select().from(appSettings).where(eq(appSettings.key, "password_changed_at")).get()?.value;
    if (changedAt && payload.iat !== undefined && payload.iat < parseInt(changedAt, 10)) {
      res.status(401).json({ error: "Session expired, please log in again" });
      return;
    }

    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
