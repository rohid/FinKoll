import { eq } from "drizzle-orm";
import { db } from "../db";
import { houses, appSettings } from "../db/schema";

// The primary residence: the `primary_house_id` app setting when set to a real
// house, otherwise the first house by sort order. null when there are no houses.
export function getPrimaryHouseId(): number | null {
  const all = db.select().from(houses).orderBy(houses.sortOrder).all();
  if (all.length === 0) return null;
  const setting = db.select().from(appSettings).where(eq(appSettings.key, "primary_house_id")).get();
  const id = setting ? parseInt(setting.value) : NaN;
  if (!Number.isNaN(id) && all.some((h) => h.id === id)) return id;
  return all[0].id;
}
