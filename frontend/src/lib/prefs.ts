// UI preferences for the Yearly matrix zebra striping and the sidebar collapse
// state. Persisted server-side (app_settings) so they sync across devices, with
// localStorage as an instant cache so there is no flash before the server load.
import api from "@/api/client";

// Server-side app_settings keys (whitelisted in backend/src/routes/settings.ts)
export const SKEY_ZEBRA_COLOR = "ui_zebra_color";
export const SKEY_ZEBRA_INTENSITY = "ui_zebra_intensity";
export const SKEY_SIDEBAR = "ui_sidebar_collapsed";

/** Fire-and-forget server persistence — a failed UI-pref write must not disrupt the app. */
function persist(key: string, value: string): void {
  api.put(`/settings/${key}`, { value }).catch(() => {});
}

export type ZebraColor = "slate" | "blue" | "green" | "amber" | "violet" | "rose";

// Base RGB triples for the selectable zebra colors.
export const ZEBRA_RGB: Record<ZebraColor, string> = {
  slate: "100, 116, 139",
  blue: "59, 130, 246",
  green: "34, 197, 94",
  amber: "245, 158, 11",
  violet: "139, 92, 246",
  rose: "244, 63, 94",
};

export const ZEBRA_COLORS = Object.keys(ZEBRA_RGB) as ZebraColor[];

const KEY_COLOR = "finkoll-zebra-color";
const KEY_INTENSITY = "finkoll-zebra-intensity";

export interface ZebraPrefs {
  color: ZebraColor;
  intensity: number; // 0–100
}

export function loadZebra(): ZebraPrefs {
  const color = (localStorage.getItem(KEY_COLOR) as ZebraColor) || "slate";
  const raw = localStorage.getItem(KEY_INTENSITY);
  const intensity = raw === null ? 35 : Math.max(0, Math.min(100, Number(raw) || 0));
  return { color: ZEBRA_RGB[color] ? color : "slate", intensity };
}

/** The rgba() string used for odd ("striped") rows. */
export function zebraStripe(color: ZebraColor, intensity: number): string {
  const alpha = (Math.max(0, Math.min(100, intensity)) / 100) * 0.6; // cap at 0.6
  return `rgba(${ZEBRA_RGB[color]}, ${alpha.toFixed(3)})`;
}

/** Write the live CSS variable consumed by the Yearly tables. */
export function applyZebra(color: ZebraColor, intensity: number): void {
  document.documentElement.style.setProperty("--zebra-stripe", zebraStripe(color, intensity));
}

export function saveZebra(color: ZebraColor, intensity: number): void {
  localStorage.setItem(KEY_COLOR, color);
  localStorage.setItem(KEY_INTENSITY, String(intensity));
  applyZebra(color, intensity);
  persist(SKEY_ZEBRA_COLOR, color);
  persist(SKEY_ZEBRA_INTENSITY, String(intensity));
}

/** Reconcile server-provided values into the local cache (server is source of truth). */
export function reconcileZebra(color: string | null, intensity: string | null): void {
  const c = (color && ZEBRA_RGB[color as ZebraColor] ? color : loadZebra().color) as ZebraColor;
  const i = intensity !== null && intensity !== "" ? Math.max(0, Math.min(100, Number(intensity) || 0)) : loadZebra().intensity;
  localStorage.setItem(KEY_COLOR, c);
  localStorage.setItem(KEY_INTENSITY, String(i));
  applyZebra(c, i);
}

// ── Sidebar collapse ────────────────────────────────────────────────────────
const KEY_SIDEBAR = "finkoll-sidebar-collapsed";

export function loadSidebarCollapsed(): boolean {
  return localStorage.getItem(KEY_SIDEBAR) === "1";
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(KEY_SIDEBAR, collapsed ? "1" : "0");
  persist(SKEY_SIDEBAR, collapsed ? "1" : "0");
}

/** Reconcile the server value into the local cache; returns the resolved value. */
export function reconcileSidebar(value: string | null): boolean {
  if (value === "1" || value === "0") {
    localStorage.setItem(KEY_SIDEBAR, value);
    return value === "1";
  }
  return loadSidebarCollapsed();
}
