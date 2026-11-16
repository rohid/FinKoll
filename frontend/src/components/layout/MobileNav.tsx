import { NavLink, useLocation } from "react-router-dom";
import { Menu, LogOut, MoreHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { KollMark } from "@/components/Logo";
import type { NavItem } from "./nav";
import { useNavItems, useGroupedNav, useLogout, LangSelect, PRIMARY_PATHS, useBetaGroupState, FlaskConical, ChevronRight } from "./nav";

// Top bar on phones: brand + hamburger. The sidebar is hidden at this width, so
// this gives the app a title and a way into the full nav drawer.
export function MobileTopBar({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <header
      className={cn("flex items-center justify-between border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]", className)}
    >
      <span className="flex items-center gap-2 text-lg font-bold text-primary"><KollMark size={22} />FinKoll</span>
      <button onClick={onOpen} title={t("nav.menu")} className="text-muted-foreground hover:text-foreground transition-colors">
        <Menu size={22} />
      </button>
    </header>
  );
}

// Fixed bottom tab bar: the primary sections + a "More" button that opens the
// full-nav drawer. Anything not in PRIMARY_PATHS lives under More.
export function BottomTabBar({ onMore, className }: { onMore: () => void; className?: string }) {
  const { t } = useTranslation();
  const nav = useNavItems();
  const { pathname } = useLocation();
  const primary = PRIMARY_PATHS.map((p) => nav.find((n) => n.to === p)!).filter(Boolean);
  // "More" is highlighted when the active route is one of the secondary sections.
  const onSecondary = !PRIMARY_PATHS.includes(pathname);

  const cell = "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium";
  return (
    <nav
      className={cn(
        "flex items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {primary.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => cn(cell, isActive ? "text-primary" : "text-muted-foreground")}
        >
          <Icon size={20} />
          <span className="max-w-full truncate px-0.5">{label}</span>
        </NavLink>
      ))}
      <button type="button" onClick={onMore} className={cn(cell, onSecondary ? "text-primary" : "text-muted-foreground")}>
        <MoreHorizontal size={20} />
        <span>{t("nav.more")}</span>
      </button>
    </nav>
  );
}

// Slide-in drawer with the complete navigation, language, and logout.
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const entries = useGroupedNav();
  const logout = useLogout();

  const betaItems = entries.find((e) => e.kind === "beta")?.items ?? [];
  const { open: betaOpen, toggle: toggleBeta } = useBetaGroupState(betaItems);

  const link = (item: NavItem, indented = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
          indented && "pl-9",
          isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )
      }
    >
      <item.icon size={18} className="flex-shrink-0" />
      {item.label}
    </NavLink>
  );

  return (
    <div className={cn("fixed inset-0 z-50 md:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
      />
      {/* Panel */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-card shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <span className="flex items-center gap-2 text-xl font-bold text-primary"><KollMark size={24} />FinKoll</span>
          <button onClick={onClose} title={t("electricity.cancel")} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {entries.map((entry) => {
            if (entry.kind === "item") return link(entry.item);
            return (
              <div key="beta-group">
                <button
                  type="button"
                  onClick={toggleBeta}
                  aria-expanded={betaOpen}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <FlaskConical size={18} className="flex-shrink-0" />
                  <span>{t("nav.betaGroup")}</span>
                  <ChevronRight size={16} className={cn("ml-auto transition-transform", betaOpen && "rotate-90")} />
                </button>
                {betaOpen && <div className="mt-1 space-y-1">{entry.items.map((it) => link(it, true))}</div>}
              </div>
            );
          })}
        </nav>

        <div className="space-y-1 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <LangSelect />
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <LogOut size={18} className="flex-shrink-0" />
            {t("nav.logout")}
          </button>
          <p className="px-3 text-[10px] text-muted-foreground/50 select-none">v{__APP_VERSION__}</p>
        </div>
      </aside>
    </div>
  );
}
