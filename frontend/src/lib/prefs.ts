// UI preferences for the Yearly matrix zebra striping and the sidebar collapse
// state. Persisted server-side (app_settings) so they sync across devices, with
// localStorage as an instant cache so there is no flash before the server load.
import api from "@/api/client";

// Server-side app_settings keys (whitelisted in backend/src/routes/settings.ts)
export const SKEY_ZEBRA_COLOR = "ui_zebra_color";
export const SKEY_ZEBRA_INTENSITY = "ui_zebra_intensity";
export const SKEY_SIDEBAR = "ui_sidebar_collapsed";
export const SKEY_THEME_MODE = "ui_theme_mode";
export const SKEY_PALETTE = "ui_palette";
export const SKEY_CUSTOM_HUE = "ui_custom_hue";
export const SKEY_BG_STYLE = "ui_bg_style";
export const SKEY_BG_OPACITY = "ui_bg_opacity";

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

// ── Theme: mode, palette, background ──────────────────────────────────────────
export type ThemeMode = "light" | "dark" | "auto";
export type Palette = "nordic" | "evergreen" | "graphite" | "sunset" | "plum" | "custom";
export type BgStyle = "none" | "aurora" | "mist" | "dunes" | "topo" | "photo";

export const THEME_MODES: ThemeMode[] = ["light", "dark", "auto"];
export const PALETTES: Exclude<Palette, "custom">[] = ["nordic", "evergreen", "graphite", "sunset", "plum"];
export const BG_STYLES: BgStyle[] = ["none", "aurora", "mist", "dunes", "topo", "photo"];

// Representative accent swatch for each preset (CSS color), for the picker UI.
export const PALETTE_SWATCH: Record<Exclude<Palette, "custom">, string> = {
  nordic: "hsl(221 83% 53%)",
  evergreen: "hsl(160 84% 31%)",
  graphite: "hsl(215 25% 25%)",
  sunset: "hsl(22 82% 51%)",
  plum: "hsl(262 80% 56%)",
};

export interface ThemePrefs {
  mode: ThemeMode;
  palette: Palette;
  customHue: number; // 0–360
  bgStyle: BgStyle;
  bgOpacity: number; // 0–40 (% the image shows through the scrim)
}

const KEY_MODE = "finkoll-theme-mode";
const KEY_PALETTE = "finkoll-palette";
const KEY_HUE = "finkoll-custom-hue";
const KEY_BG_STYLE = "finkoll-bg-style";
const KEY_BG_OPACITY = "finkoll-bg-opacity";
const KEY_BG_IMAGE = "finkoll-bg-image"; // cached data URL for the uploaded photo

const DEFAULTS: ThemePrefs = { mode: "auto", palette: "nordic", customHue: 221, bgStyle: "none", bgOpacity: 15 };

function clampHue(n: number): number { return ((Math.round(n) % 360) + 360) % 360; }
function clampOpacity(n: number): number { return Math.max(0, Math.min(40, Math.round(n))); }

export function loadTheme(): ThemePrefs {
  const mode = (localStorage.getItem(KEY_MODE) as ThemeMode) || DEFAULTS.mode;
  const palette = (localStorage.getItem(KEY_PALETTE) as Palette) || DEFAULTS.palette;
  const hueRaw = localStorage.getItem(KEY_HUE);
  const bgStyle = (localStorage.getItem(KEY_BG_STYLE) as BgStyle) || DEFAULTS.bgStyle;
  const opRaw = localStorage.getItem(KEY_BG_OPACITY);
  return {
    mode: THEME_MODES.includes(mode) ? mode : DEFAULTS.mode,
    palette: [...PALETTES, "custom"].includes(palette) ? palette : DEFAULTS.palette,
    customHue: hueRaw === null ? DEFAULTS.customHue : clampHue(Number(hueRaw) || DEFAULTS.customHue),
    bgStyle: BG_STYLES.includes(bgStyle) ? bgStyle : DEFAULTS.bgStyle,
    bgOpacity: opRaw === null ? DEFAULTS.bgOpacity : clampOpacity(Number(opRaw)),
  };
}

export function loadBgImage(): string | null {
  try { return localStorage.getItem(KEY_BG_IMAGE); } catch { return null; }
}

/** Resolve whether dark mode should be active for the given mode. */
export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Write all theme state to the document — class, data-attributes and inline vars. */
export function applyTheme(p: ThemePrefs): void {
  const el = document.documentElement;
  el.classList.toggle("dark", resolveDark(p.mode));
  el.setAttribute("data-palette", p.palette);

  // Custom hue drives the primary accent inline; clear it for presets.
  el.style.removeProperty("--primary");
  el.style.removeProperty("--ring");
  if (p.palette === "custom") {
    const accent = `${p.customHue} 72% 52%`;
    el.style.setProperty("--primary", accent);
    el.style.setProperty("--ring", accent);
  }

  // Background: scrim opacity is the inverse of how much the image shows.
  el.style.setProperty("--bg-scrim", String(1 - p.bgOpacity / 100));
  el.style.removeProperty("--bg-layer"); // clear any inline photo layer
  if (p.bgStyle === "photo") {
    const img = loadBgImage();
    if (img) {
      el.style.setProperty("--bg-layer", `url("${img}")`);
      document.body.setAttribute("data-bg", "photo");
    } else {
      document.body.setAttribute("data-bg", "none"); // no image yet → flat
    }
  } else {
    document.body.setAttribute("data-bg", p.bgStyle);
  }
}

// Individual setters — persist to localStorage + server, then re-apply.
function current(): ThemePrefs { return loadTheme(); }

export function saveThemeMode(mode: ThemeMode): void {
  localStorage.setItem(KEY_MODE, mode);
  applyTheme(current());
  persist(SKEY_THEME_MODE, mode);
}
export function savePalette(palette: Palette): void {
  localStorage.setItem(KEY_PALETTE, palette);
  applyTheme(current());
  persist(SKEY_PALETTE, palette);
}
export function saveCustomHue(hue: number): void {
  const h = clampHue(hue);
  localStorage.setItem(KEY_HUE, String(h));
  localStorage.setItem(KEY_PALETTE, "custom");
  applyTheme(current());
  persist(SKEY_CUSTOM_HUE, String(h));
  persist(SKEY_PALETTE, "custom");
}
export function saveBgStyle(style: BgStyle): void {
  localStorage.setItem(KEY_BG_STYLE, style);
  applyTheme(current());
  persist(SKEY_BG_STYLE, style);
}
export function saveBgOpacity(opacity: number): void {
  const o = clampOpacity(opacity);
  localStorage.setItem(KEY_BG_OPACITY, String(o));
  applyTheme(current());
  persist(SKEY_BG_OPACITY, String(o));
}

/** Store the uploaded background image (data URL) — cached locally and on the server. */
export async function saveBgImage(dataUrl: string): Promise<void> {
  try { localStorage.setItem(KEY_BG_IMAGE, dataUrl); } catch { /* quota — server still has it */ }
  localStorage.setItem(KEY_BG_STYLE, "photo");
  applyTheme(current());
  await api.put("/settings/background-image", { value: dataUrl }).catch(() => {});
}

export async function clearBgImage(): Promise<void> {
  localStorage.removeItem(KEY_BG_IMAGE);
  await api.delete("/settings/background-image").catch(() => {});
}

/** Fetch the server-stored background image into the local cache (for "photo"). */
export async function syncBgImage(): Promise<void> {
  try {
    const { data } = await api.get<{ value: string | null }>("/settings/background-image");
    if (data?.value) {
      try { localStorage.setItem(KEY_BG_IMAGE, data.value); } catch { /* quota */ }
    } else {
      localStorage.removeItem(KEY_BG_IMAGE);
    }
    applyTheme(loadTheme());
  } catch { /* ignore */ }
}

/** Reconcile server-provided theme values into the local cache (server wins). */
export function reconcileTheme(get: (k: string) => string | null): void {
  const mode = get(SKEY_THEME_MODE);
  const palette = get(SKEY_PALETTE);
  const hue = get(SKEY_CUSTOM_HUE);
  const bgStyle = get(SKEY_BG_STYLE);
  const bgOpacity = get(SKEY_BG_OPACITY);
  if (mode && THEME_MODES.includes(mode as ThemeMode)) localStorage.setItem(KEY_MODE, mode);
  if (palette && [...PALETTES, "custom"].includes(palette as Palette)) localStorage.setItem(KEY_PALETTE, palette);
  if (hue !== null && hue !== "") localStorage.setItem(KEY_HUE, String(clampHue(Number(hue) || DEFAULTS.customHue)));
  if (bgStyle && BG_STYLES.includes(bgStyle as BgStyle)) localStorage.setItem(KEY_BG_STYLE, bgStyle);
  if (bgOpacity !== null && bgOpacity !== "") localStorage.setItem(KEY_BG_OPACITY, String(clampOpacity(Number(bgOpacity))));
  applyTheme(loadTheme());
  // If the active style is a photo, make sure the server copy is cached.
  if (loadTheme().bgStyle === "photo" && !loadBgImage()) void syncBgImage();
}
