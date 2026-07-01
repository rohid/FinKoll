import { useState } from "react";
import { useCreateTransaction, useCategories } from "@/api/hooks";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Scissors, Trash2 } from "lucide-react";
import { fmt } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface SplitItem { description: string; amount: string; }

interface TransactionFormProps {
  year: number;
  month: number;
  onDone?: () => void;
}

export function TransactionForm({ year, month, onDone }: TransactionFormProps) {
  const { data: categories } = useCategories();
  const create = useCreateTransaction();
  const { t } = useTranslation();

  const defaultDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  // Split mode
  const [splitMode, setSplitMode] = useState(false);
  const [items, setItems] = useState<SplitItem[]>([
    { description: "", amount: "" },
    { description: "", amount: "" },
  ]);

  const itemsTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  function updateItem(idx: number, field: keyof SplitItem, val: string) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }
  function addItem()         { setItems((prev) => [...prev, { description: "", amount: "" }]); }
  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  function toggleSplit() {
    setSplitMode((v) => !v);
    setItems([{ description: "", amount: "" }, { description: "", amount: "" }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return;

    const validItems = splitMode
      ? items.filter((i) => i.description.trim() && parseFloat(i.amount) > 0)
      : [];

    await create.mutateAsync({
      date,
      description,
      amount: splitMode ? itemsTotal : parseFloat(amount),
      categoryId: parseInt(categoryId),
      notes: notes || undefined,
      items: validItems.length > 0
        ? validItems.map((i) => ({ description: i.description.trim(), amount: parseFloat(i.amount) }))
        : undefined,
    });

    setDescription(""); setAmount(""); setNotes("");
    setSplitMode(false);
    setItems([{ description: "", amount: "" }, { description: "", amount: "" }]);
    onDone?.();
  }

  const typeLabel: Record<string, string> = {
    INCOME:  t("transactionForm.income"),
    EXPENSE: t("transactionForm.expense"),
    SAVINGS: t("transactionForm.savings"),
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.date")}</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.amount")}</label>
            <button
              type="button"
              onClick={toggleSplit}
              className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                splitMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={t("transactionForm.splitModeHint")}
            >
              <Scissors size={10} />
              {t("transactionForm.splitMode")}
            </button>
          </div>
          {splitMode ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-sm font-semibold tabular-nums text-center">
              {itemsTotal > 0 ? fmt(itemsTotal) : "—"}
            </div>
          ) : (
            <Input type="number" step="0.01" placeholder="0.00" value={amount}
              onChange={(e) => setAmount(e.target.value)} required />
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.description")}</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} required
          placeholder={t("transactionForm.descriptionPlaceholder")} />
      </div>

      {/* Split items */}
      {splitMode && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("transactionForm.splitMode")}
          </p>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
                placeholder={t("transactionForm.descriptionPlaceholder")}
                className="h-7 text-xs flex-1"
              />
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={item.amount}
                onChange={(e) => updateItem(idx, "amount", e.target.value)}
                className="h-7 text-xs w-24"
              />
              {items.length > 2 && (
                <button type="button" onClick={() => removeItem(idx)}
                  className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={addItem}
              className="text-xs text-muted-foreground hover:text-foreground">
              {t("transactionForm.addItem")}
            </button>
            <span className="text-xs font-semibold tabular-nums">
              {t("transactionForm.total")}: {fmt(itemsTotal)}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t("transactionForm.category")}</label>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">{t("transactionForm.selectCategory")}</option>
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
        <Input value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={t("transactionForm.notesPlaceholder")} />
      </div>

      <Button type="submit" className="w-full" disabled={create.isPending}>
        {create.isPending ? t("transactionForm.saving") : t("transactionForm.addTransaction")}
      </Button>
    </form>
  );
}
