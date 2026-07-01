import { NavLink } from "react-router-dom";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useNavItems, useLogout, LangSelect } from "./nav";

export function Sidebar({ collapsed, onToggle, className }: { collapsed: boolean; onToggle: () => void; className?: string }) {
  const { t } = useTranslation();
  const nav = useNavItems();
  const logout = useLogout();

  return (
    <aside className={cn("flex h-screen flex-col border-r bg-card transition-[width] duration-200", collapsed ? "w-16" : "w-56", className)}>
      <div className={cn("flex items-center border-b py-5", collapsed ? "justify-center px-2" : "justify-between px-6")}>
        {!collapsed && <span className="text-xl font-bold text-primary">FinKoll</span>}
        <button
          onClick={onToggle}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "gap-3",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <Icon size={16} className="flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
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
