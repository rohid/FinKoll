import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { useTranslation } from "react-i18next";

// One-line, dismissible "this module is experimental" note shown at the top of
// modules still under active development (Investments, Assistant, Worksheets).
// Dismissal is per-module and remembered in localStorage so it stays out of the
// way once acknowledged.
export function ExperimentalBanner({ moduleKey }: { moduleKey: string }) {
  const { t } = useTranslation();
  const storageKey = `finkoll.experimental.dismissed.${moduleKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <FlaskConical size={14} className="mt-0.5 shrink-0" />
      <p className="flex-1">{t("common.experimentalNote")}</p>
      <button type="button" onClick={dismiss} title={t("common.beta")} className="shrink-0 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
