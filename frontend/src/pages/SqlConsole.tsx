import { useState } from "react";
import { useRunSql, useSqlSchema, type SqlResult } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Play, Database, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

const SAMPLES = [
  "SELECT * FROM transactions ORDER BY date DESC LIMIT 50;",
  "SELECT COUNT(*) AS total, SUM(amount) AS sum FROM transactions;",
  "SELECT c.name, COUNT(*) AS n, SUM(t.amount) AS total\n  FROM transactions t JOIN categories c ON c.id = t.category_id\n  GROUP BY c.name ORDER BY total DESC;",
  "SELECT * FROM transactions WHERE is_recurring_instance = 0 ORDER BY date;",
  "SELECT * FROM month_locks;",
];

export function SqlConsole() {
  const { t } = useTranslation();
  const { data: schema } = useSqlSchema();
  const runSql = useRunSql();

  const [query, setQuery] = useState("SELECT * FROM transactions ORDER BY date DESC LIMIT 50;");
  const [allowWrite, setAllowWrite] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setResult(null);
    runSql.mutate(
      { query, allowWrite },
      {
        onSuccess: (res) => setResult(res),
        onError: (err: any) => setError(err?.response?.data?.error ?? "Query failed"),
      }
    );
  }

  function runKeyDown(e: React.KeyboardEvent) {
    // Cmd/Ctrl + Enter to run
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("sql.title")}</h1>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
        <ShieldCheck size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300">{t("sql.safetyNote")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Editor + results */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={runKeyDown}
                rows={6}
                spellCheck={false}
                className="w-full font-mono text-sm rounded-md border border-input bg-transparent px-3 py-2 shadow-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="SELECT * FROM transactions;"
              />
              <div className="flex items-center justify-between flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />
                  <span className={allowWrite ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {t("sql.allowWrite")}
                  </span>
                </label>
                <Button onClick={run} disabled={runSql.isPending} className="gap-1.5">
                  <Play size={14} />
                  {runSql.isPending ? t("sql.running") : t("sql.run")}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("sql.shortcutHint")}</p>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertTriangle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive font-mono">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {result.readOnly
                    ? t("sql.rowsReturned", { count: result.rowCount ?? 0 })
                    : t("sql.rowsAffected", { count: result.changes ?? 0 })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!result.readOnly && result.backup && (
                  <p className="text-xs text-green-600 mb-3">
                    {t("sql.backupCreated", { filename: result.backup })}
                  </p>
                )}
                {result.readOnly && result.rows && result.rows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {result.columns!.map((c) => (
                            <th key={c} className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                            {result.columns!.map((c) => (
                              <td key={c} className="py-1.5 px-3 tabular-nums whitespace-nowrap">
                                {row[c] === null ? <span className="text-muted-foreground italic">null</span> : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : result.readOnly ? (
                  <p className="text-sm text-muted-foreground">{t("sql.noRows")}</p>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: samples + schema */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t("sql.samples")}</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {SAMPLES.map((s, i) => (
                <button key={i} onClick={() => setQuery(s)}
                  className="block w-full text-left text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded px-2 py-1 truncate">
                  {s.split("\n")[0]}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Database size={13} />{t("sql.schema")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(schema ?? []).map((tbl) => (
                <div key={tbl.table}>
                  <button onClick={() => setQuery(`SELECT * FROM ${tbl.table} LIMIT 50;`)}
                    className="text-xs font-semibold hover:text-primary">{tbl.table}</button>
                  <div className="text-[10px] text-muted-foreground font-mono leading-relaxed pl-2">
                    {tbl.columns.map((c) => c.name).join(", ")}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
