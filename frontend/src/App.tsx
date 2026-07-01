import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMe } from "@/api/hooks";
import { AppLayout } from "@/components/layout/AppLayout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Monthly } from "@/pages/Monthly";
import { Yearly } from "@/pages/Yearly";
import { Analytics } from "@/pages/Analytics";
import { Electricity } from "@/pages/Electricity";
import { Settings } from "@/pages/Settings";
import { Mortgage } from "@/pages/Mortgage";
import { SqlConsole } from "@/pages/SqlConsole";
import { Import } from "@/pages/Import";
import { Help } from "@/pages/Help";

// Worksheets pull in a spreadsheet engine — lazy-load so they stay out of the main bundle.
const Worksheets = lazy(() => import("@/pages/Worksheets").then((m) => ({ default: m.Worksheets })));
const WorksheetEditor = lazy(() => import("@/pages/WorksheetEditor").then((m) => ({ default: m.WorksheetEditor })));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });

const lazyFallback = <div className="text-muted-foreground p-2">Loading…</div>;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/monthly" element={<Monthly />} />
        <Route path="/yearly" element={<Yearly />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/mortgage"    element={<Mortgage />} />
        <Route path="/electricity" element={<Electricity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sql"      element={<SqlConsole />} />
        <Route path="/import"   element={<Import />} />
        <Route path="/help"     element={<Help />} />
        <Route path="/worksheets" element={<Suspense fallback={lazyFallback}><Worksheets /></Suspense>} />
        <Route path="/worksheets/:id" element={<Suspense fallback={lazyFallback}><WorksheetEditor /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
