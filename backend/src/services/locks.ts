import { db } from "../db";
import { monthLocks } from "../db/schema";
import { and, eq } from "drizzle-orm";

/** True if the given year/month is locked against changes. */
export function isMonthLocked(year: number, month: number): boolean {
  const row = db.select().from(monthLocks)
    .where(and(eq(monthLocks.year, year), eq(monthLocks.month, month)))
    .get();
  return !!row;
}

/** Parse a YYYY-MM-DD date string into { year, month }. */
export function ymOf(date: string): { year: number; month: number } {
  return { year: parseInt(date.slice(0, 4)), month: parseInt(date.slice(5, 7)) };
}
