import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories, useCreateCategory, useUpdateCategory, useMergeCategory, useCategoryGroups, useCreateCategoryGroup, useDeleteCategoryGroup, useRecurringTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate, useBulkActiveFrom, useBackups, useCreateBackup, useRestoreBackup, useAppSetting, useSetAppSetting, useHouses, useTags, useCreateTag, useDeleteTag, usePeople, useCreatePerson, useDeletePerson } from "@/api/hooks";
import type { BackupEntry } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/utils";
import { ZEBRA_COLORS, ZEBRA_RGB, loadZebra, saveZebra, zebraStripe, type ZebraColor,
  loadTheme, saveThemeMode, savePalette, saveCustomHue, saveBgStyle, saveBgOpacity,
  saveBgImage, clearBgImage, loadBgImage,
  PALETTES, PALETTE_SWATCH, BG_STYLES,
  type ThemeMode, type Palette, type BgStyle } from "@/lib/prefs";
import type { Category } from "@/types";
import api from "@/api/client";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type LangCode } from "@/i18n";
import i18n from "@/i18n";
import { Building2, X, Sun, Moon, Monitor, Upload, Image as ImageIcon, Trash2 } from "lucide-react";

// ── Tags manager (orthogonal labels) ──────────────────────────────────────────
// ── Category groups manager (the canonical taxonomy) ──────────────────────────
function GroupsCard() {
  const { data: groups } = useCategoryGroups();
  const create = useCreateCategoryGroup();
  const del = useDeleteCategoryGroup();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "SAVINGS">("EXPENSE");
  const [color, setColor] = useState("#6366f1");

  const typeLabel: Record<string, string> = {
    INCOME: t("dashboard.income"), EXPENSE: t("dashboard.expenses"), SAVINGS: t("dashboard.savings"),
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // New group sorts after the last one of its type.
    const maxSort = Math.max(0, ...(groups ?? []).filter((g) => g.type === type).map((g) => g.sortOrder));
    await create.mutateAsync({ name: name.trim(), type, color, sortOrder: maxSort + 1 });
    setName("");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.groups")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("settings.groupsHint")}</p>
        {(["INCOME", "EXPENSE", "SAVINGS"] as const).map((ty) => {
          const inType = (groups ?? []).filter((g) => g.type === ty).sort((a, b) => a.sortOrder - b.sortOrder);
          if (inType.length === 0) return null;
          return (
            <div key={ty} className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{typeLabel[ty]}</p>
              <div className="flex flex-wrap gap-2">
                {inType.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white" style={{ backgroundColor: g.color }}>
                    {g.name}
                    <button type="button" onClick={() => del.mutate(g.id)} title={t("settings.deleteGroupHint")} className="opacity-80 hover:opacity-100"><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <form onSubmit={add} className="flex gap-2 items-end flex-wrap pt-2 border-t">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.type")}</label>
            <Select value={type} onChange={(e) => setType(e.target.value as any)} className="w-32">
              <option value="INCOME">{t("dashboard.income")}</option>
              <option value="EXPENSE">{t("dashboard.expenses")}</option>
              <option value="SAVINGS">{t("dashboard.savings")}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.color")}</label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 p-0.5" />
          </div>
          <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.addGroup")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TagsCard() {
  const { data: tags } = useTags();
  const create = useCreateTag();
  const del = useDeleteTag();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), color });
    setName("");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.tags")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(tags ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("settings.noTags")}</p>}
          {(tags ?? []).map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white" style={{ backgroundColor: tag.color }}>
              {tag.name}
              <button type="button" onClick={() => del.mutate(tag.id)} className="opacity-80 hover:opacity-100"><X size={12} /></button>
            </span>
          ))}
        </div>
        <form onSubmit={add} className="flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.color")}</label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 p-0.5" />
          </div>
          <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.addTag")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── People manager (attribution) ──────────────────────────────────────────────
function PeopleCard() {
  const { data: people } = usePeople();
  const create = useCreatePerson();
  const del = useDeletePerson();
  const { t } = useTranslation();
  const [name, setName] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim() });
    setName("");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.people")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("settings.peopleHint")}</p>
        <div className="flex flex-wrap gap-2">
          {(people ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("settings.noPeople")}</p>}
          {(people ?? []).map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              {p.name}
              <button type="button" onClick={() => del.mutate(p.id)} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
            </span>
          ))}
        </div>
        <form onSubmit={add} className="flex gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
          </div>
          <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.addPerson")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ cat, siblings }: { cat: Category; siblings: Category[] }) {
  const update = useUpdateCategory();
  const merge = useMergeCategory();
  const { data: groups } = useCategoryGroups();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const { t } = useTranslation();

  // Groups are type-scoped — only offer groups matching this category's type.
  const typeGroups = (groups ?? []).filter((g) => g.type === cat.type);
  // Merge targets: other active categories of the same type.
  const mergeOptions = siblings.filter((c) => c.id !== cat.id && c.type === cat.type && c.isActive);

  async function doMerge() {
    const intoId = parseInt(mergeTarget);
    if (!intoId) return;
    const into = mergeOptions.find((c) => c.id === intoId);
    if (!into) return;
    if (!window.confirm(t("settings.mergeConfirm", { from: cat.name, into: into.name }))) return;
    await merge.mutateAsync({ id: cat.id, intoId });
    setMerging(false); setMergeTarget("");
  }

  function save() {
    update.mutate({ id: cat.id, name, color });
    setEditing(false);
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        {editing ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
            {cat.name}
          </div>
        )}
      </td>
      <td className="py-2 pr-4">
        <Badge variant={cat.type.toLowerCase() as any}>{cat.type}</Badge>
      </td>
      <td className="py-2 pr-4">
        <Select
          value={cat.groupId != null ? String(cat.groupId) : ""}
          onChange={(e) => update.mutate({ id: cat.id, groupId: e.target.value ? parseInt(e.target.value) : null })}
          className="h-7 text-xs w-40"
        >
          <option value="">{t("settings.ungrouped")}</option>
          {typeGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </td>
      <td className="py-2 pr-4">
        {editing ? (
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-16 p-0.5" />
        ) : (
          <span className="text-xs text-muted-foreground">{cat.color}</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <button
          type="button"
          title={cat.isHousing ? t("housing.removeFromHousing") : t("housing.addToHousing")}
          onClick={() => update.mutate({ id: cat.id, isHousing: !cat.isHousing })}
          className={cat.isHousing ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"}
        >
          <Building2 size={16} />
        </button>
      </td>
      <td className="py-2">
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={save}>{t("settings.save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("settings.cancel")}</Button>
          </div>
        ) : merging ? (
          <div className="flex items-center gap-1">
            <Select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="h-7 text-xs w-36">
              <option value="">{t("settings.mergeInto")}</option>
              {mergeOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button size="sm" onClick={doMerge} disabled={!mergeTarget || merge.isPending}>{t("settings.merge")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMerging(false); setMergeTarget(""); }}>{t("settings.cancel")}</Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("settings.edit")}</Button>
            {mergeOptions.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMerging(true)}>{t("settings.merge")}</Button>}
          </div>
        )}
      </td>
    </tr>
  );
}

function NewCategoryForm() {
  const create = useCreateCategory();
  const { data: groups } = useCategoryGroups();
  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "SAVINGS">("EXPENSE");
  const [groupId, setGroupId] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [isHousing, setIsHousing] = useState(false);
  const { t } = useTranslation();

  const typeGroups = (groups ?? []).filter((g) => g.type === type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ name, type, color, isHousing, groupId: groupId ? parseInt(groupId) : null });
    setName(""); setIsHousing(false); setGroupId("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("settings.name")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-44" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("settings.type")}</label>
        <Select value={type} onChange={(e) => { setType(e.target.value as any); setGroupId(""); }} className="w-32">
          <option value="INCOME">{t("dashboard.income")}</option>
          <option value="EXPENSE">{t("dashboard.expenses")}</option>
          <option value="SAVINGS">{t("dashboard.savings")}</option>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("settings.group")}</label>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-40">
          <option value="">{t("settings.ungrouped")}</option>
          {typeGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("settings.color")}</label>
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 p-0.5" />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground h-9 cursor-pointer select-none">
        <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={isHousing} onChange={(e) => setIsHousing(e.target.checked)} />
        <Building2 size={13} /> {t("housing.housingColumn")}
      </label>
      <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.addCategory")}</Button>
    </form>
  );
}

function RecurringRow({ template, categories }: { template: any; categories: Category[] }) {
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const { data: houses } = useHouses();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc]       = useState(template.description);
  const [amount, setAmount]   = useState(String(template.amount));
  const [catId, setCatId]     = useState(String(template.categoryId));
  const [freq, setFreq]       = useState(template.frequency);
  const [fromYear,  setFromYear]  = useState(template.activeFromYear);
  const [fromMonth, setFromMonth] = useState(template.activeFromMonth);
  const [houseId, setHouseId] = useState(String(template.houseId ?? ""));

  function openEdit() {
    setDesc(template.description);
    setAmount(String(template.amount));
    setCatId(String(template.categoryId));
    setFreq(template.frequency);
    setFromYear(template.activeFromYear);
    setFromMonth(template.activeFromMonth);
    setHouseId(String(template.houseId ?? ""));
    setEditing(true);
  }

  function save() {
    update.mutate({
      id: template.id,
      description: desc,
      amount: parseFloat(amount),
      categoryId: parseInt(catId),
      frequency: freq,
      activeFromYear: fromYear,
      activeFromMonth: fromMonth,
      houseId: houseId ? parseInt(houseId) : null,
    });
    setEditing(false);
  }

  const cat = categories.find((c) => c.id === template.categoryId);
  const hasHouses = (houses ?? []).length > 0;
  const houseName = houses?.find((h) => h.id === template.houseId)?.name;

  const freqLabel: Record<string, string> = {
    MONTHLY:    t("settings.monthly"),
    BIMONTHLY:  t("settings.bimonthly"),
    QUARTERLY:  t("settings.quarterly"),
    HALFYEARLY: t("settings.halfyearly"),
    YEARLY:     t("settings.yearly"),
  };

  if (editing) {
    return (
      <tr className="border-b last:border-0 bg-muted/20">
        <td className="py-2 pr-3">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-7 text-xs w-full" />
        </td>
        <td className="py-2 pr-3">
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-7 text-xs w-24" />
        </td>
        <td className="py-2 pr-3">
          <Select value={catId} onChange={(e) => setCatId(e.target.value)} className="h-7 text-xs w-36">
            {(categories).filter((c) => c.isActive).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </td>
        {hasHouses && (
          <td className="py-2 pr-3">
            <Select value={houseId} onChange={(e) => setHouseId(e.target.value)} className="h-7 text-xs w-32">
              <option value="">{t("housing.noHouse")}</option>
              {(houses ?? []).map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
          </td>
        )}
        <td className="py-2 pr-3">
          <Select value={freq} onChange={(e) => setFreq(e.target.value)} className="h-7 text-xs w-32">
            <option value="MONTHLY">{t("settings.monthly")}</option>
            <option value="BIMONTHLY">{t("settings.bimonthly")}</option>
            <option value="QUARTERLY">{t("settings.quarterly")}</option>
            <option value="HALFYEARLY">{t("settings.halfyearly")}</option>
            <option value="YEARLY">{t("settings.yearly")}</option>
          </Select>
        </td>
        <td className="py-2 pr-3">
          <div className="flex gap-1">
            <Select value={fromMonth} onChange={(e) => setFromMonth(parseInt(e.target.value))} className="h-7 text-xs w-16">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>
              ))}
            </Select>
            <Input type="number" value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value) || fromYear)}
              className="h-7 text-xs w-16" min={2000} max={2100} />
          </div>
        </td>
        <td className="py-2">
          <div className="flex gap-1">
            <Button size="sm" onClick={save} disabled={update.isPending}>{t("settings.save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("settings.cancel")}</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 text-sm">{template.description}</td>
      <td className="py-2 pr-4 text-sm tabular-nums">{fmt(template.amount)}</td>
      <td className="py-2 pr-4 text-sm">{cat?.name ?? "—"}</td>
      {hasHouses && <td className="py-2 pr-4 text-sm text-muted-foreground">{houseName ?? "—"}</td>}
      <td className="py-2 pr-4 text-xs text-muted-foreground">{freqLabel[template.frequency] ?? template.frequency}</td>
      <td className="py-2 pr-4 text-xs text-muted-foreground tabular-nums">
        {String(template.activeFromMonth).padStart(2, "0")}/{template.activeFromYear}
      </td>
      <td className="py-2">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={openEdit}>{t("settings.edit")}</Button>
          <Button
            size="sm"
            variant={template.isActive ? "outline" : "secondary"}
            onClick={() => update.mutate({ id: template.id, isActive: !template.isActive })}
          >
            {template.isActive ? t("settings.active") : t("settings.inactive")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => window.confirm(t("settings.deleteTemplateConfirm")) && remove.mutate(template.id)}
          >
            {t("settings.delete")}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (next !== confirm) { setError(t("settings.passwordMismatch")); return; }
    if (next.length < 8) { setError(t("settings.passwordTooShort")); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t("settings.passwordChangeFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.changePassword")}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3 max-w-sm">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("settings.currentPassword")}</label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("settings.newPassword")}</label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("settings.confirmPassword")}</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">{t("settings.passwordChanged")}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? t("settings.saving") : t("settings.changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtBackupDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function labelVariant(label: string): "default" | "secondary" | "outline" {
  if (label === "weekly") return "default";
  if (label === "daily") return "secondary";
  return "outline"; // manual
}

function BackupCard() {
  const { data: backups, isLoading } = useBackups();
  const createBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const { t } = useTranslation();

  function handleRestore(entry: BackupEntry) {
    if (!window.confirm(t("settings.restoreConfirm", { filename: entry.filename }))) return;
    setRestoringFile(entry.filename);
    restoreBackup.mutate(entry.filename, {
      onSettled: () => setRestoringFile(null),
    });
  }

  function handleDownload(filename: string) {
    window.open(`/api/backup/${encodeURIComponent(filename)}/download`, "_blank");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t("settings.backupRecovery")}</CardTitle>
        <Button size="sm" onClick={() => createBackup.mutate()} disabled={createBackup.isPending}>
          {createBackup.isPending ? t("settings.creating") : t("settings.backupNow")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t("settings.loadingBackups")}</p>}
        {!isLoading && (!backups || backups.length === 0) && (
          <p className="text-sm text-muted-foreground">{t("settings.noBackups")}</p>
        )}
        {backups && backups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.backupDate")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.backupLabel")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.backupSize")}</th>
                  <th className="text-left py-2 font-medium">{t("settings.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtBackupDate(b.createdAt)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={labelVariant(b.label)}>{b.label}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{fmtSize(b.sizeBytes)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleDownload(b.filename)}>
                          {t("settings.download")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRestore(b)}
                          disabled={restoringFile === b.filename}
                        >
                          {restoringFile === b.filename ? t("settings.restoring") : t("settings.restore")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{t("settings.backupScheduleNote")}</p>
      </CardContent>
    </Card>
  );
}

// One labelled numeric setting row (net target / expense alert / savings alert).
function TargetField({
  settingKey, label, hint, placeholder,
}: {
  settingKey: string;
  label: string;
  hint: string;
  placeholder: string;
}) {
  const { data: setting } = useAppSetting(settingKey);
  const setTarget = useSetAppSetting();
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  const current = setting?.value ? parseFloat(setting.value) : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setTarget.mutate(
      { key: settingKey, value: String(num) },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } }
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <p className="text-xs text-muted-foreground">
          {current !== null
            ? `${t("settings.currentValue")}: ${current.toLocaleString()} kr`
            : t("settings.netResultTargetNone")}
        </p>
      </div>
      <form onSubmit={save} className="flex gap-2 items-end">
        <Input
          type="number"
          step="100"
          min="0"
          placeholder={current !== null ? String(current) : placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={setTarget.isPending}>
          {t("settings.netResultTargetSave")}
        </Button>
        {saved && <span className="text-sm text-green-600 self-center">{t("settings.netResultTargetSaved")}</span>}
      </form>
    </div>
  );
}

function NetTargetCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.targets")}</CardTitle></CardHeader>
      <CardContent className="space-y-6 max-w-sm">
        <TargetField
          settingKey="net_target"
          label={t("settings.netResultTarget")}
          hint={t("settings.netResultTargetHint")}
          placeholder="14000"
        />
        <TargetField
          settingKey="ui_expense_alert"
          label={t("settings.expenseAlert")}
          hint={t("settings.expenseAlertHint")}
          placeholder="3000"
        />
        <TargetField
          settingKey="ui_savings_alert"
          label={t("settings.savingsAlert")}
          hint={t("settings.savingsAlertHint")}
          placeholder="3000"
        />
      </CardContent>
    </Card>
  );
}

function LanguageCard() {
  const { t } = useTranslation();
  const currentLang = i18n.language as LangCode;

  function handleChange(code: LangCode) {
    i18n.changeLanguage(code);
    localStorage.setItem("finkoll-lang", code);
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.language")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("settings.languageNote")}</p>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={currentLang === lang.code ? "default" : "outline"}
              size="sm"
              onClick={() => handleChange(lang.code)}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Downscale an uploaded image to a modest JPEG data URL so the stored background
// stays small (a few hundred KB) — keeps the settings payload and DB lean.
async function downscaleImage(file: File, max = 1600, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AppearanceCard() {
  const { t } = useTranslation();
  const initial = loadZebra();
  const [color, setColor] = useState<ZebraColor>(initial.color);
  const [intensity, setIntensity] = useState(initial.intensity);

  function update(next: { color?: ZebraColor; intensity?: number }) {
    const c = next.color ?? color;
    const i = next.intensity ?? intensity;
    setColor(c);
    setIntensity(i);
    saveZebra(c, i); // persists + applies the live CSS variable
  }

  const stripe = zebraStripe(color, intensity);

  // ── Theme state (mode / palette / background) ──
  const initTheme = loadTheme();
  const [mode, setMode] = useState<ThemeMode>(initTheme.mode);
  const [palette, setPalette] = useState<Palette>(initTheme.palette);
  const [hue, setHue] = useState(initTheme.customHue);
  const [bgStyle, setBgStyle] = useState<BgStyle>(initTheme.bgStyle);
  const [bgOpacity, setBgOpacity] = useState(initTheme.bgOpacity);
  const [hasImage, setHasImage] = useState(() => !!loadBgImage());
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const modes: { value: ThemeMode; icon: typeof Sun }[] = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "auto", icon: Monitor },
  ];

  function pickMode(m: ThemeMode) { setMode(m); saveThemeMode(m); }
  function pickPalette(p: Palette) { setPalette(p); savePalette(p); }
  function pickHue(h: number) { setHue(h); setPalette("custom"); saveCustomHue(h); }
  function pickBgStyle(s: BgStyle) { setBgStyle(s); saveBgStyle(s); }
  function pickBgOpacity(o: number) { setBgOpacity(o); saveBgOpacity(o); }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploadErr(null);
    try {
      const dataUrl = await downscaleImage(file);
      await saveBgImage(dataUrl);
      setHasImage(true);
      setBgStyle("photo");
    } catch {
      setUploadErr(t("settings.bgUploadError"));
    }
  }

  async function removeImage() {
    await clearBgImage();
    setHasImage(false);
    if (bgStyle === "photo") pickBgStyle("none");
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.appearance")}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Theme mode */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.themeMode")}</p>
          <div className="inline-flex rounded-lg border p-0.5">
            {modes.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => pickMode(value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={13} />{t(`settings.themeMode_${value}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Accent palette */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.palette")}</p>
          <div className="flex gap-2 flex-wrap items-center">
            {PALETTES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => pickPalette(p)}
                title={t(`settings.palette_${p}`)}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  palette === p ? "border-foreground ring-2 ring-offset-2 ring-offset-background ring-foreground/30" : "border-border"
                }`}
                style={{ backgroundColor: PALETTE_SWATCH[p] }}
              />
            ))}
            {/* Custom hue */}
            <button
              type="button"
              onClick={() => pickHue(hue)}
              title={t("settings.palette_custom")}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                palette === "custom" ? "border-foreground ring-2 ring-offset-2 ring-offset-background ring-foreground/30" : "border-border"
              }`}
              style={{ backgroundColor: `hsl(${hue} 72% 52%)` }}
            />
          </div>
          {palette === "custom" && (
            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={hue}
                onChange={(e) => pickHue(parseInt(e.target.value))}
                className="flex-1 accent-primary"
                style={{ background: "linear-gradient(to right, hsl(0 72% 52%), hsl(60 72% 52%), hsl(120 72% 52%), hsl(180 72% 52%), hsl(240 72% 52%), hsl(300 72% 52%), hsl(360 72% 52%))", borderRadius: 4 }}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{hue}°</span>
            </div>
          )}
        </div>

        {/* Background */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.background")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.backgroundHint")}</p>
          <div className="flex gap-2 flex-wrap">
            {BG_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickBgStyle(s)}
                disabled={s === "photo" && !hasImage}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  bgStyle === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "photo" && <ImageIcon size={12} />}{t(`settings.bg_${s}`)}
              </button>
            ))}
          </div>

          {/* Upload / remove photo */}
          <div className="flex items-center gap-2 pt-1">
            <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload size={13} />{hasImage ? t("settings.bgReplace") : t("settings.bgUpload")}
            </Button>
            {hasImage && (
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={removeImage}>
                <Trash2 size={13} />{t("settings.bgRemove")}
              </Button>
            )}
          </div>
          {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}

          {/* Image visibility (only meaningful when a background is active) */}
          {bgStyle !== "none" && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t("settings.bgOpacity")}</p>
                <span className="text-xs text-muted-foreground tabular-nums">{bgOpacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={5}
                value={bgOpacity}
                onChange={(e) => pickBgOpacity(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          )}
        </div>

        <div className="border-t" />

        {/* Zebra color */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.zebraColor")}</p>
          <div className="flex gap-2 flex-wrap">
            {ZEBRA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update({ color: c })}
                title={c}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c ? "border-foreground ring-2 ring-offset-2 ring-offset-background ring-foreground/30" : "border-border"
                }`}
                style={{ backgroundColor: `rgb(${ZEBRA_RGB[c]})` }}
              />
            ))}
          </div>
        </div>

        {/* Zebra intensity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("settings.zebraIntensity")}</p>
            <span className="text-xs text-muted-foreground tabular-nums">{intensity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={intensity}
            onChange={(e) => update({ intensity: parseInt(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("settings.preview")}</p>
          <div className="rounded-md border overflow-hidden text-sm">
            {["Salary", "Side income", "Rent / Mortgage", "Groceries", "Insurance"].map((label, i) => (
              <div
                key={label}
                className="flex justify-between px-3 py-1.5 border-b last:border-0"
                style={i % 2 === 1 ? { backgroundColor: stripe } : undefined}
              >
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">—</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── AI assistant provider configuration ────────────────────────────────────────
function AssistantForm({ initProvider, initUrl, initModel, hasKey }: {
  initProvider: string; initUrl: string; initModel: string; hasKey: boolean;
}) {
  const { t } = useTranslation();
  const save = useSetAppSetting();
  const qc = useQueryClient();
  const defaultModel = (p: string) => (p === "claude" ? "claude-haiku-5-5" : p === "ollama" ? "qwen2.5:3b" : "");
  const [prov, setProv] = useState(initProvider);
  const [url, setUrl] = useState(initUrl);
  const [model, setModel] = useState(initModel || defaultModel(initProvider));
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  function changeProvider(p: string) {
    setProv(p);
    if (!model || model === defaultModel(prov)) setModel(defaultModel(p));
  }

  async function onSave() {
    await save.mutateAsync({ key: "ai_provider", value: prov });
    if (prov === "ollama") {
      await save.mutateAsync({ key: "ai_base_url", value: url || "http://localhost:11434" });
      if (model) await save.mutateAsync({ key: "ai_model", value: model });
    }
    if (prov === "claude") {
      if (model) await save.mutateAsync({ key: "ai_model", value: model });
      if (apiKey.trim()) await save.mutateAsync({ key: "ai_api_key", value: apiKey.trim() });
    }
    qc.invalidateQueries({ queryKey: ["assistant"] });
    setApiKey(""); setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">{t("settings.aiIntro")}</p>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t("settings.aiProvider")}</label>
        <Select value={prov} onChange={(e) => changeProvider(e.target.value)}>
          <option value="off">{t("settings.aiOff")}</option>
          <option value="claude">{t("settings.aiClaude")}</option>
          <option value="ollama">{t("settings.aiOllama")}</option>
          <option value="mock">{t("settings.aiMock")}</option>
        </Select>
      </div>

      {prov === "ollama" && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.aiBaseUrl")}</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:11434" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.aiModel")}</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:3b" />
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.aiOllamaHint")}</p>
        </>
      )}

      {prov === "claude" && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.aiModel")}</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-haiku-5-5" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("settings.aiApiKey")}</label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? t("settings.aiKeySet") : "sk-ant-…"} />
          </div>
          <p className="text-xs text-amber-600">{t("settings.aiCloudNotice")}</p>
        </>
      )}

      {prov === "mock" && <p className="text-xs text-muted-foreground">{t("settings.aiMockHint")}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={save.isPending}>{t("settings.save")}</Button>
        {saved && <span className="text-xs text-green-600">{t("settings.saved")}</span>}
      </div>
    </div>
  );
}

function AssistantSettingsCard() {
  const { t } = useTranslation();
  const provider = useAppSetting("ai_provider");
  const baseUrl = useAppSetting("ai_base_url");
  const model = useAppSetting("ai_model");
  const apiKey = useAppSetting("ai_api_key");
  const loaded = [provider, baseUrl, model, apiKey].every((q) => q.data !== undefined);
  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.aiTitle")}</CardTitle></CardHeader>
      <CardContent>
        {loaded ? (
          <AssistantForm
            key={provider.data!.value ?? "off"}
            initProvider={provider.data!.value ?? "off"}
            initUrl={baseUrl.data!.value ?? "http://localhost:11434"}
            initModel={model.data!.value ?? ""}
            hasKey={apiKey.data!.value === "set"}
          />
        ) : <p className="text-sm text-muted-foreground">…</p>}
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const { data: categories } = useCategories();
  const { data: templates } = useRecurringTemplates();
  const { data: houses } = useHouses();
  const { data: primarySetting } = useAppSetting("primary_house_id");
  const createTemplate = useCreateTemplate();
  const bulkActiveFrom = useBulkActiveFrom();
  const { t } = useTranslation();

  const hasHouses = (houses ?? []).length > 0;
  const primaryHouseId = primarySetting?.value ? parseInt(primarySetting.value) : houses?.[0]?.id;

  const [bulkMonth, setBulkMonth] = useState(1);

  function applyBulkActiveFrom() {
    const monthLabel = String(bulkMonth).padStart(2, "0");
    if (!window.confirm(t("settings.setAllConfirm", { month: monthLabel }))) return;
    bulkActiveFrom.mutate({ month: bulkMonth });
  }

  const [tDesc, setTDesc] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [tCatId, setTCatId] = useState("");
  const [tFreq, setTFreq] = useState<"MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "HALFYEARLY" | "YEARLY">("MONTHLY");
  const now = new Date();
  // Default to January of the current year so templates apply to any past month this year
  const [tFromYear,  setTFromYear]  = useState(now.getFullYear());
  const [tFromMonth, setTFromMonth] = useState(1);
  // House: housing-type categories default to the primary residence until overridden.
  const [tHouseId, setTHouseId] = useState("");
  const [tHouseTouched, setTHouseTouched] = useState(false);

  function pickTemplateCategory(id: string) {
    setTCatId(id);
    if (!tHouseTouched) {
      const cat = (categories ?? []).find((c) => String(c.id) === id);
      setTHouseId(cat?.isHousing && primaryHouseId ? String(primaryHouseId) : "");
    }
  }

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tCatId) return;
    await createTemplate.mutateAsync({
      description: tDesc,
      amount: parseFloat(tAmount),
      categoryId: parseInt(tCatId),
      frequency: tFreq,
      activeFromYear: tFromYear,
      activeFromMonth: tFromMonth,
      isActive: true,
      houseId: tHouseId ? parseInt(tHouseId) : null,
    });
    setTDesc(""); setTAmount(""); setTCatId("");
    setTHouseId(""); setTHouseTouched(false);
  }

  function exportCsv(year: number) {
    window.open(`/api/summary/export?year=${year}`, "_blank");
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      {/* Language */}
      <LanguageCard />

      {/* Appearance (zebra striping) */}
      <AppearanceCard />

      {/* Monthly targets */}
      <NetTargetCard />

      {/* AI assistant (financial copilot) */}
      <AssistantSettingsCard />

      {/* Categories */}
      <Card>
        <CardHeader><CardTitle>{t("settings.categories")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.name")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.type")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.group")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.color")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("housing.housingColumn")}</th>
                  <th className="text-left py-2 font-medium">{t("settings.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(categories ?? []).map((cat) => <CategoryRow key={cat.id} cat={cat} siblings={categories ?? []} />)}
              </tbody>
            </table>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">{t("settings.addCategory")}</p>
            <NewCategoryForm />
          </div>
        </CardContent>
      </Card>

      {/* Category groups, Tags & People */}
      <GroupsCard />
      <TagsCard />
      <PeopleCard />

      {/* Recurring templates */}
      <Card>
        <CardHeader><CardTitle>{t("settings.recurringTemplates")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.description")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.amount")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.category")}</th>
                  {hasHouses && <th className="text-left py-2 pr-4 font-medium">{t("housing.house")}</th>}
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.frequency")}</th>
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.activeFrom")}</th>
                  <th className="text-left py-2 font-medium">{t("settings.status")}</th>
                </tr>
              </thead>
              <tbody>
                {(templates ?? []).map((tmpl) => (
                  <RecurringRow key={tmpl.id} template={tmpl} categories={categories ?? []} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">{t("settings.setAllActiveFrom")}</p>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.month")}</label>
                <Select value={bulkMonth} onChange={(e) => setBulkMonth(parseInt(e.target.value))} className="w-20">
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>
                  ))}
                </Select>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={applyBulkActiveFrom} disabled={bulkActiveFrom.isPending}>
                {t("settings.applyToAll")}
              </Button>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">{t("settings.addTemplate")}</p>
            <form onSubmit={addTemplate} className="flex gap-2 flex-wrap items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.description")}</label>
                <Input value={tDesc} onChange={(e) => setTDesc(e.target.value)} required className="w-44" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.amount")}</label>
                <Input type="number" value={tAmount} onChange={(e) => setTAmount(e.target.value)} required className="w-28" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.category")}</label>
                <Select value={tCatId} onChange={(e) => pickTemplateCategory(e.target.value)} required className="w-40">
                  <option value="">{t("transactionForm.selectCategory")}</option>
                  {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              {hasHouses && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("housing.house")}</label>
                  <Select value={tHouseId} onChange={(e) => { setTHouseId(e.target.value); setTHouseTouched(true); }} className="w-40">
                    <option value="">{t("housing.noHouse")}</option>
                    {(houses ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.frequency")}</label>
                <Select value={tFreq} onChange={(e) => setTFreq(e.target.value as any)} className="w-36">
                  <option value="MONTHLY">{t("settings.monthly")}</option>
                  <option value="BIMONTHLY">{t("settings.bimonthly")}</option>
                  <option value="QUARTERLY">{t("settings.quarterly")}</option>
                  <option value="HALFYEARLY">{t("settings.halfyearly")}</option>
                  <option value="YEARLY">{t("settings.yearly")}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("settings.activeFrom")}</label>
                <div className="flex gap-1">
                  <Select value={tFromMonth} onChange={(e) => setTFromMonth(parseInt(e.target.value))} className="w-20">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    value={tFromYear}
                    onChange={(e) => setTFromYear(parseInt(e.target.value) || now.getFullYear())}
                    className="w-20"
                    min={2000}
                    max={2100}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={createTemplate.isPending}>
                {t("settings.add")}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <ChangePasswordCard />

      {/* Backup & Recovery */}
      <BackupCard />

      {/* Export */}
      <Card>
        <CardHeader><CardTitle>{t("settings.exportData")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => (
              <Button key={y} variant="outline" onClick={() => exportCsv(y)}>
                {t("settings.exportCsv", { year: y })}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
