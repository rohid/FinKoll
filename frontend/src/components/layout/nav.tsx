import {
  LayoutDashboard, Calendar, BarChart3, TrendingUp,
  Zap, Settings, Home, Database, Upload, Table2, HelpCircle, Globe,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import i18n, { LANGUAGES, type LangCode } from "@/i18n";

export type NavItem = { to: string; icon: LucideIcon; label: string };

// Single source of truth for the navigation, shared by the desktop sidebar, the
// mobile bottom tab bar, and the mobile drawer.
export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  return [
    { to: "/",            icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/monthly",     icon: Calendar,        label: t("nav.monthly") },
    { to: "/yearly",      icon: BarChart3,       label: t("nav.yearly") },
    { to: "/analytics",   icon: TrendingUp,      label: t("nav.analytics") },
    { to: "/worksheets",  icon: Table2,          label: t("nav.worksheets") },
    { to: "/mortgage",    icon: Home,            label: t("nav.mortgage") },
    { to: "/electricity", icon: Zap,             label: t("nav.electricity") },
    { to: "/settings",    icon: Settings,        label: t("nav.settings") },
    { to: "/import",      icon: Upload,          label: t("nav.import") },
    { to: "/sql",         icon: Database,        label: t("nav.sql") },
    { to: "/help",        icon: HelpCircle,      label: t("nav.help") },
  ];
}

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
