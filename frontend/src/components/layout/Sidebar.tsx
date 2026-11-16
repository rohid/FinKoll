import { NavLink } from "react-router-dom";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { KollMark } from "@/components/Logo";
import type { NavItem } from "./nav";
import { useGroupedNav, useLogout, LangSelect, useBetaGroupState, FlaskConical, ChevronRight } from "./nav";

export function Sidebar({ collapsed, onToggle, className }: { collapsed: boolean; onToggle: () => void; className?: string }) {
  const { t } = useTranslation();
  const entries = useGroupedNav();
  const logout = useLogout();

  const betaItems = entries.find((e) => e.kind === "beta")?.items ?? [];
  const { open: betaOpen, toggle: toggleBeta } = useBetaGroupState(betaItems);

  // One link row, shared by top-level items and (indented) beta children.
  const link = (item: NavItem, indented = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
          collapsed ? "justify-center" : indented ? "gap-3 pl-9" : "gap-3",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )
      }
    >
      <item.icon size={16} className="flex-shrink-0" />
      {!collapsed && item.label}
    </NavLink>
  );

  return (
    <aside className={cn("flex h-screen flex-col border-r bg-card transition-[width] duration-200", collapsed ? "w-16" : "w-56", className)}>
      <div className={cn("flex items-center border-b py-5", collapsed ? "flex-col gap-3 px-2" : "justify-between px-6")}>
        {collapsed ? (
          <KollMark size={24} />
        ) : (
          <span className="flex items-center gap-2 text-xl font-bold text-primary">
            <KollMark size={26} />
            FinKoll
          </span>
        )}
        <button
          onClick={onToggle}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {entries.map((entry) => {
          if (entry.kind === "item") return link(entry.item);
          // Beta group. Collapsed sidebar has no room for a header → render the
          // beta items as plain icon rows (still reachable); expanded shows the
          // collapsible "Beta" toggle.
          if (collapsed) return entry.items.map((it) => link(it));
          return (
            <div key="beta-group">
              <button
                type="button"
                onClick={toggleBeta}
                aria-expanded={betaOpen}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <FlaskConical size={16} className="flex-shrink-0" />
                <span>{t("nav.betaGroup")}</span>
                <ChevronRight size={14} className={cn("ml-auto transition-transform", betaOpen && "rotate-90")} />
              </button>
              {betaOpen && <div className="mt-1 space-y-1">{entry.items.map((it) => link(it, true))}</div>}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t space-y-1">
        {!collapsed && <LangSelect />}

        <button
          onClick={logout}
          title={collapsed ? t("nav.logout") : undefined}
          className={cn(
            "flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            collapsed ? "justify-center" : "gap-3"
          )}
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && t("nav.logout")}
        </button>
        {!collapsed && (
          <p className="px-3 text-[10px] text-muted-foreground/50 select-none">
            v{__APP_VERSION__}
          </p>
        )}
      </div>
    </aside>
  );
}
