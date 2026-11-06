import { useState } from "react";
import {
  LayoutDashboard, Calendar, BarChart3, TrendingUp,
  Zap, Settings, Home, Database, Upload, Table2, HelpCircle, Globe, LineChart, Building2, PiggyBank, Sparkles, ShieldCheck,
  FlaskConical, ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import i18n, { LANGUAGES, type LangCode } from "@/i18n";

export type NavItem = { to: string; icon: LucideIcon; label: string; experimental?: boolean };

// Single source of truth for the navigation, shared by the desktop sidebar, the
// mobile bottom tab bar, and the mobile drawer. The experimental (beta) items are
// kept consecutive so they fold into a single collapsible group (see useGroupedNav).
export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  return [
    { to: "/",            icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/monthly",     icon: Calendar,        label: t("nav.monthly") },
    { to: "/yearly",      icon: BarChart3,       label: t("nav.yearly") },
    { to: "/analytics",   icon: TrendingUp,      label: t("nav.analytics") },
    { to: "/mortgage",    icon: Home,            label: t("nav.mortgage") },
    { to: "/housing",     icon: Building2,       label: t("nav.housing") },
    { to: "/pension",     icon: PiggyBank,       label: t("nav.pension") },
    { to: "/electricity", icon: Zap,             label: t("nav.electricity") },
    // ── Beta / experimental (rendered inside a collapsible "Beta" group) ──
    { to: "/assistant",   icon: Sparkles,        label: t("nav.assistant"),   experimental: true },
    { to: "/worksheets",  icon: Table2,          label: t("nav.worksheets"),  experimental: true },
    { to: "/investments", icon: LineChart,       label: t("nav.investments"), experimental: true },
    // ── Config / utilities ──
    { to: "/settings",    icon: Settings,        label: t("nav.settings") },
    { to: "/data-health", icon: ShieldCheck,     label: t("nav.dataHealth") },
    { to: "/import",      icon: Upload,          label: t("nav.import") },
    { to: "/sql",         icon: Database,        label: t("nav.sql") },
    { to: "/help",        icon: HelpCircle,      label: t("nav.help") },
  ];
}

// A rendered navigation entry: either a plain item, or the collapsible beta group.
export type NavEntry =
  | { kind: "item"; item: NavItem }
  | { kind: "beta"; items: NavItem[] };

// Fold each maximal run of consecutive experimental items into one "beta" group,
// leaving every other item in place. Used by the sidebar and the mobile drawer.
export function useGroupedNav(): NavEntry[] {
  const items = useNavItems();
  const entries: NavEntry[] = [];
  let run: NavItem[] = [];
  const flush = () => {
    if (run.length) { entries.push({ kind: "beta", items: run }); run = []; }
  };
  for (const it of items) {
    if (it.experimental) run.push(it);
    else { flush(); entries.push({ kind: "item", item: it }); }
  }
  flush();
  return entries;
}

// Open/closed state for the beta group, persisted per browser. The group is also
// forced open while the active route is one of its items, so the current page is
// never hidden.
const BETA_OPEN_KEY = "finkoll-beta-open";
export function useBetaGroupState(items: NavItem[]) {
  const { pathname } = useLocation();
  const activeInBeta = items.some((i) => i.to === pathname);
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(BETA_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(BETA_OPEN_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  return { open: open || activeInBeta, toggle };
}

// Icons for the collapsible beta group's header (re-exported so the sidebar and
// mobile drawer share one source).
export { FlaskConical, ChevronRight };

// Which items get a slot in the mobile bottom tab bar (the rest live under "More").
export const PRIMARY_PATHS = ["/", "/monthly", "/yearly", "/electricity"];

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api.post("/auth/logout");
    qc.clear();
    window.location.href = "/login";
  };
}

// Small "Beta" pill marking a module that is still under active development.
// Rendered beside the label in the sidebar and mobile drawer (never in the
// collapsed sidebar or the bottom tab bar, where there's no room for it).
export function BetaBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-amber-600 dark:text-amber-400 ${className ?? ""}`}
    >
      {t("common.beta")}
    </span>
  );
}

export function LangSelect() {
  function setLang(code: LangCode) {
    i18n.changeLanguage(code);
    localStorage.setItem("finkoll-lang", code);
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Globe size={14} className="text-muted-foreground flex-shrink-0" />
      <select
        value={i18n.language}
        onChange={(e) => setLang(e.target.value as LangCode)}
        className="flex-1 text-xs bg-transparent text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </div>
  );
}
