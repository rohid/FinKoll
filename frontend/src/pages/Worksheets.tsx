import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorksheets, useCreateWorksheet, useDeleteWorksheet, type WorksheetMeta } from "@/api/hooks";
import api from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table2, Scale, Wallet, TrendingUp, Wrench, Copy, Trash2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

const KIND_ICON: Record<string, typeof Table2> = {
  Comparison: Scale,
  Budget: Wallet,
  Projection: TrendingUp,
  Investments: Wrench,
};

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function Worksheets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: list, isLoading } = useWorksheets();
  const create = useCreateWorksheet();
  const remove = useDeleteWorksheet();

  const [name, setName] = useState("");
  const [kind, setKind] = useState("Worksheet");

  const KINDS = ["Worksheet", "Comparison", "Budget", "Projection", "Investments"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await create.mutateAsync({ name: name.trim(), kind });
    setName("");
    navigate(`/worksheets/${created.id}`);
  }

  async function duplicate(w: WorksheetMeta) {
    const full = await api.get(`/worksheets/${w.id}`).then((r) => r.data);
    const copy = await create.mutateAsync({ name: `${w.name} (copy)`, kind: w.kind, data: full.data });
    navigate(`/worksheets/${copy.id}`);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Table2 size={22} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("worksheets.title")}</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">{t("worksheets.new")}</p>
          <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("worksheets.name")}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-56" placeholder={t("worksheets.namePlaceholder")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("worksheets.kind")}</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40">
                {KINDS.map((k) => <option key={k} value={k}>{t(`worksheets.kinds.${k}`)}</option>)}
              </Select>
            </div>
            <Button type="submit" size="sm" disabled={create.isPending}>
              <Plus size={14} className="mr-1" /> {t("worksheets.create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">{t("worksheets.loading")}</p>
          ) : !list || list.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">{t("worksheets.empty")}</p>
          ) : (
            <div>
              {list.map((w, i) => {
                const Icon = KIND_ICON[w.kind] ?? Table2;
                return (
                  <div key={w.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t" : ""}`}>
                    <Icon size={18} className="text-muted-foreground flex-shrink-0" />
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => navigate(`/worksheets/${w.id}`)}
                    >
                      <div className="text-sm font-medium truncate hover:text-primary transition-colors">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{t("worksheets.editedAt", { when: fmtWhen(w.updatedAt) })}</div>
                    </button>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">
                      {t(`worksheets.kinds.${w.kind}`, w.kind)}
                    </span>
                    <button type="button" title={t("worksheets.duplicate")} onClick={() => duplicate(w)} className="text-muted-foreground hover:text-foreground p-1">
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      title={t("worksheets.delete")}
                      onClick={() => window.confirm(t("worksheets.deleteConfirm", { name: w.name })) && remove.mutate(w.id)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
