import { useState } from "react";
import {
  useTransactions, useMonthlySummary, useDeleteTransaction,
  useApplyAllTemplates, useUpdateTransaction, useCategories, useClearMonth,
  useAppSetting, useMonthLock, useLockMonth, useUnlockMonth,
} from "@/api/hooks";
import { MonthSelector } from "@/components/MonthSelector";
import { BudgetTable } from "@/components/BudgetTable";
import { TransactionForm } from "@/components/TransactionForm";
import { KpiCard } from "@/components/KpiCard";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fmt, fmtPct } from "@/lib/utils";
import { Trash2, RefreshCw, MessageSquare, MessageSquarePlus, Pencil, AlertTriangle, Scissors, Lock, LockOpen } from "lucide-react";
import type { Transaction, TransactionItem } from "@/types";
import { useTranslation } from "react-i18next";

function dupKey(tx: Pick<Transaction, "amount" | "description">) {
  return `${tx.amount}:${tx.description.trim().toLowerCase()}`;
}

// ── Reusable items editor used in both the add form and inline edit ────────────
interface EditItem { description: string; amount: string; }

function ItemsEditor({ items, onChange }: {
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
}) {
  const { t } = useTranslation();
  function update(idx: number, field: keyof EditItem, val: string) {
    onChange(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }
  function add()               { onChange([...items, { description: "", amount: "" }]); }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-1.5 items-center">
          <Input value={item.description} onChange={(e) => update(idx, "description", e.target.value)}
            placeholder={t("transactionForm.descriptionPlaceholder")} className="h-7 text-xs flex-1" />
          <Input type="number" step="0.01" placeholder="0.00" value={item.amount}
            onChange={(e) => update(idx, "amount", e.target.value)} className="h-7 text-xs w-24" />
          {items.length > 1 && (
            <button type="button" onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <button type="button" onClick={add} className="text-[11px] text-muted-foreground hover:text-foreground">
          {t("transactionForm.addItem")}
        </button>
        <span className="text-[11px] font-semibold tabular-nums">
          {t("transactionForm.total")}: {fmt(total)}
        </span>
      </div>
    </div>
  );
}

// ── Transaction detail dialog ──────────────────────────────────────────────────
function TransactionDetail({ tx, open, onClose }: { tx: Transaction; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t("monthly.transactionDetail")}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tx.categoryColor }} />
            <div>
              <p className="font-semibold">{tx.description}</p>
              <p className="text-xs text-muted-foreground">{tx.date} · {tx.categoryName}</p>
            </div>
          </div>
          <span className={`text-xl font-bold tabular-nums flex-shrink-0 ${tx.categoryType === "INCOME" ? "text-green-600" : ""}`}>
            {tx.categoryType === "INCOME" ? "+" : "−"}{fmt(Math.abs(tx.amount))}
          </span>
        </div>

        {/* Breakdown */}
        {tx.items.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t("monthly.breakdown")}
            </p>
            <div className="rounded-md border divide-y">
              {tx.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">{item.description}</span>
                  <span className="text-sm font-medium tabular-nums">{fmt(item.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                <span className="text-sm font-semibold">{t("transactionForm.total")}</span>
                <span className="text-sm font-bold tabular-nums">{fmt(tx.amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {tx.notes && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {t("transactionForm.notes")}
            </p>
            <p className="text-sm text-muted-foreground italic">{tx.notes}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ── Main transaction row ───────────────────────────────────────────────────────
function TransactionRow({ t: tx, isDuplicate, locked }: { t: Transaction; isDuplicate: boolean; locked: boolean }) {
  const deleteT = useDeleteTransaction();
  const updateT = useUpdateTransaction();
  const { data: categories } = useCategories();
  const { t } = useTranslation();

  const [showDetail, setShowDetail] = useState(false);

  // Comment editing
  const [editingComment, setEditingComment] = useState(false);
  const [draft, setDraft] = useState(tx.notes ?? "");

  // Field editing
  const [editingFields, setEditingFields] = useState(false);
  const [editDate, setEditDate] = useState(tx.date);
  const [editDesc, setEditDesc] = useState(tx.description);
  const [editCatId, setEditCatId] = useState(String(tx.categoryId));
  const [editNotes, setEditNotes] = useState(tx.notes ?? "");
  // Items editing: start from existing items or single-amount mode
  const [editSplitMode, setEditSplitMode] = useState(tx.items.length > 0);
  const [editItems, setEditItems] = useState<EditItem[]>(
    tx.items.length > 0
      ? tx.items.map((i) => ({ description: i.description, amount: String(i.amount) }))
      : [{ description: "", amount: String(tx.amount) }]
  );
  const [editAmount, setEditAmount] = useState(String(tx.amount));

  const editItemsTotal = editItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  function openEdit() {
    setEditDate(tx.date);
    setEditDesc(tx.description);
    setEditCatId(String(tx.categoryId));
    setEditNotes(tx.notes ?? "");
    setEditSplitMode(tx.items.length > 0);
    setEditItems(
      tx.items.length > 0
        ? tx.items.map((i) => ({ description: i.description, amount: String(i.amount) }))
        : [{ description: "", amount: String(tx.amount) }]
    );
    setEditAmount(String(tx.amount));
    setEditingFields(true);
    setEditingComment(false);
  }

  function saveFields(e: React.FormEvent) {
    e.preventDefault();
    const validItems = editSplitMode
      ? editItems.filter((i) => i.description.trim() && parseFloat(i.amount) > 0)
      : [];
    updateT.mutate({
      id: tx.id,
      date: editDate,
      description: editDesc,
      amount: editSplitMode ? editItemsTotal : parseFloat(editAmount),
      categoryId: parseInt(editCatId),
      notes: editNotes.trim() || undefined,
      items: validItems.length > 0
        ? validItems.map((i) => ({ description: i.description.trim(), amount: parseFloat(i.amount) }))
        : [],
    });
    setEditingFields(false);
  }

  function saveComment() {
    const value = draft.trim();
    if (value !== (tx.notes ?? "").trim()) updateT.mutate({ id: tx.id, notes: value || undefined });
    setEditingComment(false);
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveComment(); }
    if (e.key === "Escape") { setDraft(tx.notes ?? ""); setEditingComment(false); }
  }

  const typeLabel: Record<string, string> = {
    INCOME:  t("transactionForm.income"),
    EXPENSE: t("transactionForm.expense"),
    SAVINGS: t("transactionForm.savings"),
  };

  return (
    <>
      <TransactionDetail tx={tx} open={showDetail} onClose={() => setShowDetail(false)} />

      <div className={`py-2 border-b last:border-0 rounded-sm transition-colors ${isDuplicate ? "bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-400 pl-2 -ml-2" : ""}`}>
        {/* Summary row */}
        <div className="flex items-start justify-between">
          {/* Clickable info area → opens detail dialog */}
          <button
            type="button"
            className="flex items-start gap-2 min-w-0 text-left hover:opacity-80 flex-1"
            onClick={() => !editingFields && !editingComment && setShowDetail(true)}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: tx.categoryColor }} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                {tx.items.length > 0 && (
                  <span className="flex-shrink-0" title={t("monthly.breakdown")}>
                    <Scissors size={11} className="text-muted-foreground" />
                  </span>
                )}
                {isDuplicate && (
                  <span title={t("monthly.possibleDuplicate")} className="flex-shrink-0">
                    <AlertTriangle size={13} className="text-amber-500" />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tx.date} · {tx.categoryName}</p>
              {!editingComment && !editingFields && tx.notes && (
                <p className="text-xs text-muted-foreground italic mt-0.5">{tx.notes}</p>
              )}
            </div>
          </button>

          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <span className={`text-sm font-semibold tabular-nums ${tx.categoryType === "INCOME" ? "text-green-600" : ""}`}>
              {tx.categoryType === "INCOME" ? "+" : "−"}{fmt(Math.abs(tx.amount))}
            </span>
            {!locked && (<>
            <Button variant="ghost" size="icon"
              className={`h-7 w-7 ${editingFields ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title={t("monthly.editTransaction")}
              onClick={() => editingFields ? setEditingFields(false) : openEdit()}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon"
              className={`h-7 w-7 ${tx.notes ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"}`}
              title={tx.notes ? t("monthly.editComment") : t("monthly.addComment")}
              onClick={() => { setDraft(tx.notes ?? ""); setEditingComment(true); setEditingFields(false); }}>
              {tx.notes ? <MessageSquare size={13} /> : <MessageSquarePlus size={13} />}
            </Button>
            <Button variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteT.mutate(tx.id)}>
              <Trash2 size={13} />
            </Button>
            </>)}
          </div>
        </div>

        {/* Inline edit form */}
        {editingFields && (
          <form onSubmit={saveFields} className="mt-2 ml-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("transactionForm.date")}</label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-7 text-xs" required />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("transactionForm.amount")}</label>
                  <button type="button" onClick={() => setEditSplitMode((v) => !v)}
                    className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded ${editSplitMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Scissors size={9} />{t("transactionForm.splitMode")}
                  </button>
                </div>
                {editSplitMode
                  ? <div className="rounded border bg-primary/5 text-center text-xs font-semibold py-1">{fmt(editItemsTotal)}</div>
                  : <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-7 text-xs" required />
                }
              </div>
            </div>
            {editSplitMode && <ItemsEditor items={editItems} onChange={setEditItems} />}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("transactionForm.description")}</label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-7 text-xs" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("transactionForm.category")}</label>
              <Select value={editCatId} onChange={(e) => setEditCatId(e.target.value)} required className="h-7 text-xs">
                {["INCOME", "EXPENSE", "SAVINGS"].map((type) => (
                  <optgroup key={type} label={typeLabel[type]}>
                    {(categories ?? []).filter((c) => c.type === type && c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t("transactionForm.notes")}</label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-7 text-xs" placeholder={t("transactionForm.notesPlaceholder")} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={updateT.isPending}>{t("settings.save")}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingFields(false)}>{t("settings.cancel")}</Button>
            </div>
          </form>
        )}

        {/* Comment editing */}
        {editingComment && (
          <div className="mt-2 ml-4">
            <textarea autoFocus rows={2} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveComment} onKeyDown={handleCommentKeyDown}
              placeholder={t("monthly.commentPlaceholder")}
              className="w-full text-xs rounded-md border border-input bg-transparent px-3 py-1.5 shadow-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("monthly.commentHint")}</p>
          </div>
        )}
      </div>
    </>
  );
}

export function Monthly() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const { t } = useTranslation();

  const { data: transactions } = useTransactions(year, month);
  const { data: summary } = useMonthlySummary(year, month);
  const { data: targetSetting } = useAppSetting("net_target");
  const netTarget = targetSetting?.value ? parseFloat(targetSetting.value) : null;
  const { data: lockData } = useMonthLock(year, month);
  const locked = lockData?.locked ?? false;
  const lockMonth   = useLockMonth();
  const unlockMonth = useUnlockMonth();
  const applyAll = useApplyAllTemplates();
  const clearMonth = useClearMonth();

  // Compute which transactions share the same amount + description (case-insensitive).
  // Any key that appears more than once is flagged as a potential duplicate.
  const duplicateKeys = new Set<string>();
  if (transactions) {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      const k = dupKey(tx);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) if (n > 1) duplicateKeys.add(k);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("monthly.title")}</h1>
        <div className="flex items-center gap-3">
          {/* Lock / Unlock toggle */}
          <Button
            variant={locked ? "default" : "outline"}
            size="sm"
            className={locked ? "gap-1.5" : "gap-1.5 text-muted-foreground"}
            onClick={() => locked
              ? unlockMonth.mutate({ year, month })
              : lockMonth.mutate({ year, month })
            }
            disabled={lockMonth.isPending || unlockMonth.isPending}
            title={locked ? t("monthly.unlockMonth") : t("monthly.lockMonth")}
          >
            {locked ? <Lock size={13} /> : <LockOpen size={13} />}
            {locked ? t("monthly.unlockMonth") : t("monthly.lockMonth")}
          </Button>

          {!locked && <>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive"
            onClick={() => {
              if (window.confirm(t("monthly.clearMonthConfirm"))) {
                clearMonth.mutate({ year, month });
              }
            }}
            disabled={clearMonth.isPending}
          >
            {t("monthly.clearMonth")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyAll.mutate({ year, month })}
            disabled={applyAll.isPending}
          >
            <RefreshCw size={14} />
            {t("monthly.applyRecurring")}
          </Button>
          </>}
          <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      {/* Lock banner */}
      {locked && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <Lock size={15} className="text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{t("monthly.monthLocked")}</p>
            <p className="text-xs text-muted-foreground">{t("monthly.monthLockedHint")}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label={t("monthly.income")}     value={fmt(summary?.totalIncome ?? 0)}   positive={true} />
        <KpiCard label={t("monthly.expenses")}   value={fmt(summary?.totalExpenses ?? 0)} />
        <KpiCard label={t("monthly.savings")}    value={fmt(summary?.totalSavings ?? 0)} />
        <KpiCard
          label={t("monthly.netResult")}
          value={fmt(summary?.netResult ?? 0)}
          positive={
            !summary ? null
            : summary.netResult < 0 ? false
            : netTarget !== null && summary.netResult < netTarget ? "warning"
            : true
          }
          sub={netTarget !== null ? t("dashboard.netResultTarget", { target: fmt(netTarget) }) : undefined}
        />
        <KpiCard label={t("monthly.savingsRate")} value={fmtPct(summary?.savingsRate ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {(["INCOME", "EXPENSE", "SAVINGS"] as const).map((type) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle>
                  {type === "INCOME"   ? t("monthly.income")   :
                   type === "EXPENSE"  ? t("monthly.expenses") :
                                        t("monthly.savings")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetTable categories={summary?.categories ?? []} filterType={type} />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("monthly.transactions")}</CardTitle>
              {!locked && (
                <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                  {showForm ? t("monthly.cancel") : t("monthly.add")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!locked && showForm && (
                <div className="mb-4 pb-4 border-b">
                  <TransactionForm year={year} month={month} onDone={() => setShowForm(false)} />
                </div>
              )}
              <div>
                {(transactions ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t("monthly.noTransactions")}
                  </p>
                )}
                {(transactions ?? []).map((tx) => (
                  <TransactionRow key={tx.id} t={tx} isDuplicate={duplicateKeys.has(dupKey(tx))} locked={locked} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
