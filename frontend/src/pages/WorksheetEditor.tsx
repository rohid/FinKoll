import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorksheet, useUpdateWorksheet, useYearlySummary } from "@/api/hooks";
import { Spreadsheet } from "@/components/Spreadsheet";
import { parseSheet, serializeSheet, buildFinkollNamed, type SheetData } from "@/lib/worksheet";
import { ChevronLeft, ChevronRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type SaveStatus = "idle" | "saving" | "saved";

export function WorksheetEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const { data: ws, isLoading } = useWorksheet(Number.isNaN(id) ? null : id);
  const update = useUpdateWorksheet();

  // FinKoll bridge: which year's data the named values reflect.
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: summary } = useYearlySummary(year);
  // Stable reference so the engine's named-expression sync doesn't re-run on every keystroke.
  const namedValues = useMemo(() => buildFinkollNamed(year, summary), [year, summary]);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Initialize the editable name once the worksheet loads.
  useEffect(() => { if (ws) setName(ws.name); }, [ws?.id]);

  // Debounced autosave.
  const timer = useRef<number | null>(null);
  const pending = useRef<{ name?: string; data?: string }>({});

  function flush() {
    if (Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    update.mutate({ id, ...patch }, { onSuccess: () => setStatus("saved") });
  }

  function scheduleSave(patch: { name?: string; data?: string }) {
    pending.current = { ...pending.current, ...patch };
    setStatus("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  }

  // Flush any pending edit when leaving the editor.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (Object.keys(pending.current).length) {
      update.mutate({ id, ...pending.current });
    }
  }, [id]);

  function onSheetChange(next: SheetData) {
    scheduleSave({ data: serializeSheet(next) });
  }

  function onNameChange(v: string) {
    setName(v);
    if (v.trim()) scheduleSave({ name: v.trim() });
  }

  if (isLoading || !ws) {
    return <p className="text-muted-foreground">{t("worksheets.loading")}</p>;
  }

  const initial = parseSheet(ws.data);

  return (
    <div className="space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate("/worksheets")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> {t("worksheets.title")}
        </button>
        <span className="text-muted-foreground">/</span>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-lg font-semibold bg-transparent outline-none border-b border-transparent focus:border-primary/40 min-w-48"
        />
        <span className="flex-1" />
        {/* FinKoll year selector */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("worksheets.finkollYear")}</span>
          <button type="button" onClick={() => setYear((y) => y - 1)} className="p-1 hover:text-foreground"><ChevronLeft size={14} /></button>
          <span className="font-semibold text-foreground tabular-nums">{year}</span>
          <button type="button" onClick={() => setYear((y) => y + 1)} className="p-1 hover:text-foreground"><ChevronRight size={14} /></button>
        </div>
        {/* Save status */}
        <span className="inline-flex items-center gap-1 text-xs min-w-16">
          {status === "saving" && <><Loader2 size={13} className="animate-spin text-muted-foreground" /> <span className="text-muted-foreground">{t("worksheets.saving")}</span></>}
          {status === "saved" && <><Check size={13} className="text-green-600" /> <span className="text-green-600">{t("worksheets.saved")}</span></>}
        </span>
      </div>

      <Spreadsheet key={id} initial={initial} namedValues={namedValues} onChange={onSheetChange} />
    </div>
  );
}
