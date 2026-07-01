import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileTopBar, BottomTabBar, MobileDrawer } from "./MobileNav";
import { useAllSettings } from "@/api/hooks";
import {
  loadSidebarCollapsed, saveSidebarCollapsed, reconcileSidebar, reconcileZebra,
  SKEY_ZEBRA_COLOR, SKEY_ZEBRA_INTENSITY, SKEY_SIDEBAR,
} from "@/lib/prefs";

export function AppLayout() {
  // Start from the localStorage cache (instant, no flash), then reconcile with
  // the server values once they load (server is the source of truth).
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: settings } = useAllSettings();

  useEffect(() => {
    if (!settings) return;
    reconcileZebra(settings[SKEY_ZEBRA_COLOR], settings[SKEY_ZEBRA_INTENSITY]);
    setCollapsed(reconcileSidebar(settings[SKEY_SIDEBAR]));
  }, [settings]);

  function toggle() {
    setCollapsed((c) => {
      saveSidebarCollapsed(!c);
      return !c;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on phones/tablets-portrait */}
      <Sidebar collapsed={collapsed} onToggle={toggle} className="hidden md:flex" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileTopBar onOpen={() => setDrawerOpen(true)} className="md:hidden" />
        <main className="flex-1 overflow-y-auto bg-background p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
        <BottomTabBar onMore={() => setDrawerOpen(true)} className="md:hidden" />
      </div>

      {/* Full-nav drawer (opened by the hamburger or the "More" tab) */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
