import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useCategories, useExistingMonths, useCommitImport, useImportMappings, type ImportCommitBody } from "@/api/hooks";
import { detectImport, csvToGrid, normalizeLabel, type DetectedImport, type DetectedRow } from "@/lib/importParser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { fmt } from "@/lib/utils";
import { Upload, AlertTriangle, CheckCircle, FileSpreadsheet, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

const CREATE = "__create__";

type RowChoice = string; // "" unmapped · "<categoryId>" · "__create__"

const TYPE_COLORS: Record<string, string> = {
  INCOME: "#22c55e", EXPENSE: "#ef4444", SAVINGS: "#3b82f6",
};

export function Import() {
  const { t } = useTranslation();
  const { data: categories } = useCategories();
  const { data: savedMappings } = useImportMappings();
  const commit = useCommitImport();

  const [detected, setDetected] = useState<DetectedImport | null>(null);
  const [choices, setChoices] = useState<RowChoice[]>([]);
  const [include, setInclude] = useState<boolean[]>([]);
  const [remembered, setRemembered] = useState<boolean[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const [confirmMonths, setConfirmMonths] = useState<number[] | null>(null);
  const [result, setResult] = useState<{ inserted: number; backup: string } | null>(null);
  const [lockedError, setLockedError] = useState<number[] | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const { data: existing } = useExistingMonths(year);
  const existingMonths = new Set(existing?.months ?? []);
  const months = t("months", { returnObjects: true }) as string[];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !categories) return;
    setParseError(null); setResult(null); setCommitError(null); setLockedError(null);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      let grid: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        grid = csvToGrid(new TextDecoder().decode(buf));
      } else {
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
      }
      const det = detectImport(grid, categories, year);
      setDetected(det);
      setYear(det.year);

      // Saved alias lookup: normalizedLabel → categoryId (only for matching type & existing category)
      const aliasMap = new Map<string, number>();
      for (const m of savedMappings ?? []) aliasMap.set(m.label, m.categoryId);

      const rememberedFlags: boolean[] = [];
      setChoices(det.rows.map((r) => {
        // 1. Remembered mapping wins — if the category still exists and matches this row's type
        const saved = aliasMap.get(normalizeLabel(r.label));
        if (saved) {
          const cat = categories.find((c) => c.id === saved);
          if (cat && cat.type === r.type && cat.isActive) { rememberedFlags.push(true); return String(saved); }
        }
        rememberedFlags.push(false);
        // 2. Otherwise a confident fuzzy match
        return r.matchedCategoryId && r.matchScore >= 0.5 ? String(r.matchedCategoryId) : "";
      }));
      setRemembered(rememberedFlags);
      setInclude(det.rows.map(() => true));
    } catch (err: any) {
      setParseError(err?.message ?? "Could not parse file");
      setDetected(null);
    }
    e.target.value = ""; // allow re-selecting same file
  }

  // Build the commit body from current UI state
  function buildBody(forceOverwrite: boolean, overwriteMonths: number[]): ImportCommitBody {
    const newCategories: ImportCommitBody["newCategories"] = [];
    const createKey = new Map<string, string>(); // "name|type" → tempId

    const rows: ImportCommitBody["rows"] = [];
    detected!.rows.forEach((r, i) => {
      if (!include[i]) return;
      const choice = choices[i];
      if (!choice) return; // unmapped → skip
      const amounts: Record<string, number> = {};
      for (const [m, v] of Object.entries(r.amounts)) amounts[m] = v;

      if (choice === CREATE) {
        const key = `${r.label}|${r.type}`;
        let tempId = createKey.get(key);
        if (!tempId) {
          tempId = `t${newCategories.length}`;
          createKey.set(key, tempId);
          newCategories.push({ tempId, name: r.label, type: r.type, color: TYPE_COLORS[r.type] });
        }
        rows.push({ description: r.label, newCategoryTempId: tempId, amounts });
      } else {
        rows.push({ description: r.label, categoryId: parseInt(choice), amounts });
      }
    });

    return { year, forceOverwrite, overwriteMonths, newCategories, rows };
  }

  function runCommit(forceOverwrite: boolean, overwriteMonths: number[]) {
    setLockedError(null);
    setCommitError(null);
    commit.mutate(buildBody(forceOverwrite, overwriteMonths), {
      onSuccess: (res) => {
        if (res.lockedMonths) { setLockedError(res.lockedMonths); setConfirmMonths(null); return; }
        if (!res.committed && res.needsConfirmation) { setConfirmMonths(res.needsConfirmation); return; }
        if (res.committed) {
          setResult({ inserted: res.inserted ?? 0, backup: res.backup ?? "" });
          setConfirmMonths(null);
          setDetected(null);
        }
      },
      onError: (err: any) => {
        const data = err?.response?.data;
        setConfirmMonths(null);
        if (data?.lockedMonths) {
          setLockedError(data.lockedMonths);
        } else {
          const msg = typeof data?.error === "string" ? data.error : (err?.message ?? "Import failed");
          setCommitError(msg);
        }
      },
    });
  }

  // Counts for the summary line
  const summary = useMemo(() => {
    if (!detected) return null;
    let mapped = 0, create = 0, skip = 0, tx = 0;
    detected.rows.forEach((r, i) => {
      if (!include[i] || !choices[i]) { skip++; return; }
      if (choices[i] === CREATE) create++; else mapped++;
      tx += Object.keys(r.amounts).length;
    });
    return { mapped, create, skip, tx };
  }, [detected, choices, include]);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">{t("import.title")}</h1>

      {/* Upload zone */}
      {!detected && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center gap-4 text-center">
              <FileSpreadsheet size={40} className="text-muted-foreground" />
              <div>
                <p className="font-medium">{t("import.uploadPrompt")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("import.uploadHint")}</p>
              </div>
              <label className="inline-flex">
                <input type="file" accept=".xlsx,.csv" onChange={onFile} className="hidden" />
                <span className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium cursor-pointer hover:opacity-90">
                  <Upload size={15} /> {t("import.chooseFile")}
                </span>
              </label>
              {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {result && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle size={36} className="text-green-500" />
              <p className="font-medium">{t("import.success", { count: result.inserted })}</p>
              {result.backup && <p className="text-xs text-muted-foreground">{t("import.backupNote", { filename: result.backup })}</p>}
              <Button variant="outline" size="sm" onClick={() => setResult(null)}>{t("import.importAnother")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {detected && (
        <>
          {detected.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} /> {w}
            </div>
          ))}

          {lockedError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              <Lock size={15} /> {t("import.lockedError", { months: lockedError.map((m) => months[m - 1]).join(", ") })}
            </div>
          )}

          {commitError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              <AlertTriangle size={15} /> {t("import.commitError", { error: commitError })}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle>{t("import.reviewTitle")} — {fileName}</CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("import.year")}</span>
                  <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)}
                    className="w-24 rounded-md border border-input bg-transparent px-2 py-1 text-sm" />
                </div>
              </div>
              {summary && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("import.summary", { tx: summary.tx, mapped: summary.mapped, create: summary.create, skip: summary.skip })}
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="w-8"></th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t("import.colLabel")}</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t("import.colCategory")}</th>
                      {detected.months.map((m) => (
                        <th key={m} className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {existingMonths.has(m) && <AlertTriangle size={10} className="text-amber-500" />}
                            {months[m - 1]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detected.rows.map((r, i) => (
                      <ReviewRow
                        key={i}
                        row={r}
                        months={detected.months}
                        categories={(categories ?? []).filter((c) => c.type === r.type && c.isActive)}
                        choice={choices[i]}
                        included={include[i]}
                        remembered={remembered[i]}
                        onChoice={(v) => setChoices((c) => c.map((x, j) => (j === i ? v : x)))}
                        onInclude={(v) => setInclude((c) => c.map((x, j) => (j === i ? v : x)))}
                        createLabel={t("import.createCategory")}
                        selectLabel={t("import.selectCategory")}
                        rememberedLabel={t("import.remembered")}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {existingMonths.size > 0 && detected.months.some((m) => existingMonths.has(m)) && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle size={13} /> {t("import.existingWarning")}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => runCommit(false, [])} disabled={commit.isPending || !summary?.tx}>
              {commit.isPending ? t("import.importing") : t("import.import")}
            </Button>
            <Button variant="ghost" onClick={() => { setDetected(null); setParseError(null); }}>
              {t("import.cancel")}
            </Button>
          </div>
        </>
      )}

      {/* Overwrite confirmation dialog */}
      <Dialog
        open={confirmMonths !== null}
        onClose={() => setConfirmMonths(null)}
        title={t("import.overwriteTitle")}
      >
        <div className="space-y-4">
          <p className="text-sm">
            {t("import.overwriteBody", { months: (confirmMonths ?? []).map((m) => months[m - 1]).join(", ") })}
          </p>
          <p className="text-xs text-muted-foreground">{t("import.overwriteBackupNote")}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => runCommit(false, confirmMonths ?? [])} disabled={commit.isPending}>
              {t("import.overwriteThese")}
            </Button>
            <Button variant="outline" onClick={() => runCommit(true, [])} disabled={commit.isPending}>
              {t("import.overwriteAll")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmMonths(null)}>{t("import.cancel")}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ReviewRow({
  row, months, categories, choice, included, remembered, onChoice, onInclude, createLabel, selectLabel, rememberedLabel,
}: {
  row: DetectedRow;
  months: number[];
  categories: { id: number; name: string }[];
  choice: string;
  included: boolean;
  remembered: boolean;
  onChoice: (v: string) => void;
  onInclude: (v: boolean) => void;
  createLabel: string;
  selectLabel: string;
  rememberedLabel: string;
}) {
  const lowConfidence = choice && choice !== CREATE && row.matchScore < 0.75 && row.matchedCategoryId === parseInt(choice);
  return (
    <tr className={`border-b last:border-0 ${!included ? "opacity-40" : ""}`}>
      <td className="px-2 text-center">
        <input type="checkbox" checked={included} onChange={(e) => onInclude(e.target.checked)} />
      </td>
      <td className="py-1.5 px-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[row.type] }} />
          {row.label}
          {lowConfidence && <span title="Low-confidence match" className="text-amber-500">≈</span>}
        </div>
      </td>
      <td className="py-1.5 px-3">
        <div className="flex items-center gap-1.5">
          <Select value={choice} onChange={(e) => onChoice(e.target.value)} className="h-7 text-xs w-48">
            <option value="">— {selectLabel} —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={CREATE}>➕ {createLabel}: “{row.label}”</option>
          </Select>
          {remembered && choice && choice !== CREATE && (
            <span title={rememberedLabel} className="text-[10px] text-primary whitespace-nowrap">↺</span>
          )}
        </div>
      </td>
      {months.map((m) => (
        <td key={m} className="text-right py-1.5 px-3 tabular-nums">
          {row.amounts[m] !== undefined ? fmt(row.amounts[m]) : <span className="text-muted-foreground">—</span>}
        </td>
      ))}
    </tr>
  );
}
