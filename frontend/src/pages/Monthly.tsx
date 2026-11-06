import { useState, useEffect } from "react";
import {
  useTransactions, useMonthlySummary, useDeleteTransaction,
  useApplyAllTemplates, useUpdateTransaction, useCategories, useClearMonth,
  useAppSetting, useMonthLock, useLockMonth, useUnlockMonth, useHouses,
} from "@/api/hooks";
import { MonthSelector } from "@/components/MonthSelector";
import { TransactionForm } from "@/components/TransactionForm";
import { AssistantQuickAdd } from "@/components/assistant/QuickAdd";
import { KpiCard } from "@/components/KpiCard";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fmt, fmtPct } from "@/lib/utils";
import { Trash2, RefreshCw, MessageSquare, MessageSquarePlus, Pencil, AlertTriangle, Scissors, Lock, LockOpen, Search, X, Building2, Plus, MoreVertical } from "lucide-react";
import type { Transaction } from "@/types";
import { useTranslation } from "react-i18next";

function dupKey(tx: Pick<Transaction, "amount" | "description">) {
  return `${tx.amount}:${tx.description.trim().toLowerCase()}`;
}

// ── Reusable items editor used in the edit form ────────────────────────────────
interface EditItem { description: string; amount: string; houseId: string; } // houseId "" = inherit the transaction's house

function ItemsEditor({ items, onChange, houses }: {
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
  houses?: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  function update(idx: number, field: keyof EditItem, val: string) {
    onChange(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }
  function add()               { onChange([...items, { description: "", amount: "", houseId: "" }]); }
  function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const multiHouse = (houses ?? []).length > 1;

  return (
    <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-1.5 items-center">
          <Input value={item.description} onChange={(e) => update(idx, "description", e.target.value)}
            placeholder={t("transactionForm.descriptionPlaceholder")} className="h-7 text-xs flex-1" />
          <Input type="number" step="0.01" placeholder="0.00" value={item.amount}
            onChange={(e) => update(idx, "amount", e.target.value)} className="h-7 text-xs w-24" />
          {multiHouse && (
            <Select value={item.houseId} onChange={(e) => update(idx, "houseId", e.target.value)}
              className="h-7 text-xs w-28" title={t("housing.house")}>
              <option value="">{t("housing.inheritHouse")}</option>
              {(houses ?? []).map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
          )}
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
  const { data: houses } = useHouses();
  // Per-line house label: the line's own house, else the transaction's (inherited).
  const lineHouse = (houseId?: number | null) =>
    houses?.find((h) => h.id === (houseId ?? tx.houseId))?.name;
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
                  <span className="text-sm flex items-center gap-1.5">
                    {item.description}
                    {lineHouse(item.houseId) && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Building2 size={9} />{lineHouse(item.houseId)}
                      </span>
                    )}
                  </span>
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

// ── Edit form (rendered inside the slide-over drawer) ──────────────────────────
function EditTransactionForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const updateT = useUpdateTransaction();
  const { data: categories } = useCategories();
  const { data: houses } = useHouses();
  const { t } = useTranslation();

  const [date, setDate] = useState(tx.date);
  const [desc, setDesc] = useState(tx.description);
  const [catId, setCatId] = useState(String(tx.categoryId));
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [houseId, setHouseId] = useState(String(tx.houseId ?? ""));
  const [splitMode, setSplitMode] = useState(tx.items.length > 0);
  const [items, setItems] = useState<EditItem[]>(
    tx.items.length > 0
      ? tx.items.map((i) => ({ description: i.description, amount: String(i.amount), houseId: String(i.houseId ?? "") }))
      : [{ description: "", amount: String(tx.amount), houseId: "" }]
  );
  const [amount, setAmount] = useState(String(tx.amount));
  const itemsTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const typeLabel: Record<string, string> = {
    INCOME:  t("transactionForm.income"),
    EXPENSE: t("transactionForm.expense"),
    SAVINGS: t("transactionForm.savings"),
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    const validItems = splitMode
      ? items.filter((i) => i.description.trim() && parseFloat(i.amount) > 0)
      : [];
    updateT.mutate({
      id: tx.id,
      date,
      description: desc,
      amount: splitMode ? itemsTotal : parseFloat(amount),
      categoryId: parseInt(catId),
      notes: notes.trim() || undefined,
      houseId: houseId ? parseInt(houseId) : null,
      items: validItems.length > 0
        ? validItems.map((i) => ({ description: i.description.trim(), amount: parseFloat(i.amount), houseId: i.houseId ? parseInt(i.houseId) : null }))
        : [],
    });
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.date")}</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.amount")}</label>
            <button type="button" onClick={() => setSplitMode((v) => !v)}
              className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${splitMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Scissors size={10} />{t("transactionForm.splitMode")}
            </button>
          </div>
          {splitMode
            ? <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-sm font-semibold tabular-nums text-center">{itemsTotal > 0 ? fmt(itemsTotal) : "—"}</div>
            : <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          }
        </div>
      </div>
      {splitMode && <ItemsEditor items={items} onChange={setItems} houses={houses} />}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.description")}</label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.category")}</label>
        <Select value={catId} onChange={(e) => setCatId(e.target.value)} required>
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
        <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.notes")}</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("transactionForm.notesPlaceholder")} />
      </div>
      {(houses ?? []).length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("housing.house")}</label>
          <Select value={houseId} onChange={(e) => setHouseId(e.target.value)}>
            <option value="">{t("housing.noHouse")}</option>
            {(houses ?? []).map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={updateT.isPending}>{t("settings.save")}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("settings.cancel")}</Button>
      </div>
    </form>
  );
}

// ── Main transaction row (read + quick comment; full edit opens the drawer) ─────
function TransactionRow({ t: tx, isDuplicate, locked, onEdit }: { t: Transaction; isDuplicate: boolean; locked: boolean; onEdit: (tx: Transaction) => void }) {
  const deleteT = useDeleteTransaction();
  const updateT = useUpdateTransaction();
  const { data: houses } = useHouses();
  const { t } = useTranslation();

  const houseName = houses?.find((h) => h.id === tx.houseId)?.name;

  const [showDetail, setShowDetail] = useState(false);

  // Inline quick-comment editing (full field edit lives in the drawer).
  const [editingComment, setEditingComment] = useState(false);
  const [draft, setDraft] = useState(tx.notes ?? "");

  function saveComment() {
    const value = draft.trim();
    if (value !== (tx.notes ?? "").trim()) updateT.mutate({ id: tx.id, notes: value || undefined });
    setEditingComment(false);
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveComment(); }
    if (e.key === "Escape") { setDraft(tx.notes ?? ""); setEditingComment(false); }
  }

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
            onClick={() => !editingComment && setShowDetail(true)}
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
                {houseName && (
                  <span title={t("housing.house")} className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 rounded px-1 py-px">
                    <Building2 size={9} />{houseName}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{tx.date} · {tx.categoryName}</p>
              {!editingComment && tx.notes && (
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
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={t("monthly.editTransaction")}
              onClick={() => onEdit(tx)}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon"
              className={`h-7 w-7 ${tx.notes ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"}`}
              title={tx.notes ? t("monthly.editComment") : t("monthly.addComment")}
              onClick={() => { setDraft(tx.notes ?? ""); setEditingComment(true); }}>
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

// ── Compact overflow menu for the secondary month actions ──────────────────────
function MoreMenu({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setOpen((v) => !v)}
        title={t("monthly.moreActions")}>
        <MoreVertical size={14} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border bg-background p-1 shadow-lg">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted ${danger ? "text-destructive" : ""}`}>
      {children}
    </button>
  );
}

export function Monthly() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "INCOME" | "EXPENSE" | "SAVINGS">("ALL");
  // The slide-over drawer holds all data entry: add, or edit of a given tx.
  const [drawer, setDrawer] = useState<{ mode: "add" } | { mode: "edit"; tx: Transaction } | null>(null);
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
  const duplicateKeys = new Set<string>();
  if (transactions) {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      const k = dupKey(tx);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) if (n > 1) duplicateKeys.add(k);
  }

  // Filter the displayed transactions by the search term. Duplicate detection above
  // stays on the full list so the flag remains accurate while filtering.
  const q = search.trim().toLowerCase();
  const visibleTransactions = (transactions ?? []).filter((tx) => {
    if (typeFilter !== "ALL" && tx.categoryType !== typeFilter) return false;
    if (!q) return true;
    return (
      tx.description.toLowerCase().includes(q) ||
      (tx.categoryName ?? "").toLowerCase().includes(q) ||
      (tx.notes ?? "").toLowerCase().includes(q) ||
      tx.items.some((it) => it.description.toLowerCase().includes(q)) ||
      String(tx.amount).includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header: title + primary Add + collapsed secondary actions + month picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{t("monthly.title")}</h1>
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" title={t("monthly.monthLocked")}>
              <Lock size={11} />{t("monthly.locked")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <Button size="sm" className="gap-1.5" onClick={() => setDrawer({ mode: "add" })}>
              <Plus size={15} />{t("monthly.add")}
            </Button>
          )}
          <MoreMenu>
            {(close) => (
              <>
                {!locked && (<>
                  <MenuItem onClick={() => { applyAll.mutate({ year, month }); close(); }}>
                    <RefreshCw size={14} />{t("monthly.applyRecurring")}
                  </MenuItem>
                  <MenuItem danger onClick={() => {
                    if (window.confirm(t("monthly.clearMonthConfirm"))) clearMonth.mutate({ year, month });
                    close();
                  }}>
                    <Trash2 size={14} />{t("monthly.clearMonth")}
                  </MenuItem>
                  <div className="my-1 border-t" />
                </>)}
                <MenuItem onClick={() => {
                  locked ? unlockMonth.mutate({ year, month }) : lockMonth.mutate({ year, month });
                  close();
                }}>
                  {locked ? <LockOpen size={14} /> : <Lock size={14} />}
                  {locked ? t("monthly.unlockMonth") : t("monthly.lockMonth")}
                </MenuItem>
              </>
            )}
          </MoreMenu>
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

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <KpiCard label={t("monthly.income")}     value={fmt(summary?.totalIncome ?? 0)}   positive={true} />
        <KpiCard label={t("monthly.expenses")}   value={fmt(summary?.totalExpenses ?? 0)} />
        <KpiCard label={t("housing.costLabel")}  value={fmt(summary?.housingTotal ?? 0)} />
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

      {/* Ledger: the month's transactions. The planned-vs-actual budget tables and
          the housing-cost breakdown live on the Dashboard (also monthly), so this
          page stays a focused, filterable statement. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t("monthly.transactions")}</CardTitle>
          {(transactions ?? []).length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {t("monthly.txCount", { count: visibleTransactions.length })}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {/* Filter toolbar: type segments + free-text search */}
          {(transactions ?? []).length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
              <div className="inline-flex self-start rounded-lg border p-0.5">
                {([
                  ["ALL", t("monthly.all")],
                  ["INCOME", t("monthly.income")],
                  ["EXPENSE", t("monthly.expenses")],
                  ["SAVINGS", t("monthly.savings")],
                ] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setTypeFilter(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${typeFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("monthly.searchPlaceholder")}
                  className="h-8 pl-8 pr-8 text-sm"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")}
                    title={t("monthly.clearSearch")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty / no-match states */}
          {(transactions ?? []).length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("monthly.noTransactions")}</p>
              {!locked && (
                <Button size="sm" className="mt-3 gap-1.5" onClick={() => setDrawer({ mode: "add" })}>
                  <Plus size={14} />{t("monthly.add")}
                </Button>
              )}
            </div>
          )}
          {(transactions ?? []).length > 0 && visibleTransactions.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {search.trim() ? t("monthly.noSearchResults", { query: search.trim() }) : t("monthly.noTypeResults")}
            </p>
          )}

          {/* The statement — two balanced columns on wide screens use the full width */}
          <div className="lg:columns-2 lg:gap-x-8">
            {visibleTransactions.map((tx) => (
              <div key={tx.id} className="break-inside-avoid">
                <TransactionRow t={tx} isDuplicate={duplicateKeys.has(dupKey(tx))} locked={locked}
                  onEdit={(x) => setDrawer({ mode: "edit", tx: x })} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Data-entry drawer: add (quick-add + form) or edit */}
      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? t("monthly.editTransaction") : t("monthly.addTransaction")}
      >
        {drawer?.mode === "add" && (
          <div className="space-y-4">
            <AssistantQuickAdd year={year} month={month} />
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">{t("monthly.orEnterManually")}</span></div>
            </div>
            <TransactionForm year={year} month={month} onDone={() => setDrawer(null)} />
          </div>
        )}
        {drawer?.mode === "edit" && (
          <EditTransactionForm tx={drawer.tx} onDone={() => setDrawer(null)} />
        )}
      </Drawer>
    </div>
  );
}
