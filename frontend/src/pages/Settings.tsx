import { useState } from "react";
import { useCategories, useCreateCategory, useUpdateCategory, useRecurringTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate, useBulkActiveFrom, useBackups, useCreateBackup, useRestoreBackup, useAppSetting, useSetAppSetting } from "@/api/hooks";
import type { BackupEntry } from "@/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/utils";
import { ZEBRA_COLORS, ZEBRA_RGB, loadZebra, saveZebra, zebraStripe, type ZebraColor } from "@/lib/prefs";
import type { Category } from "@/types";
import api from "@/api/client";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type LangCode } from "@/i18n";
import i18n from "@/i18n";

function CategoryRow({ cat }: { cat: Category }) {
  const update = useUpdateCategory();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const { t } = useTranslation();

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
        {editing ? (
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-16 p-0.5" />
        ) : (
          <span className="text-xs text-muted-foreground">{cat.color}</span>
        )}
      </td>
      <td className="py-2">
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={save}>{t("settings.save")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("settings.cancel")}</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("settings.edit")}</Button>
        )}
      </td>
    </tr>
  );
}

function NewCategoryForm() {
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "SAVINGS">("EXPENSE");
  const [color, setColor] = useState("#6366f1");
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ name, type, color });
    setName("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
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
      <Button type="submit" size="sm" disabled={create.isPending}>{t("settings.addCategory")}</Button>
    </form>
  );
}

function RecurringRow({ template, categories }: { template: any; categories: Category[] }) {
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc]       = useState(template.description);
  const [amount, setAmount]   = useState(String(template.amount));
  const [catId, setCatId]     = useState(String(template.categoryId));
  const [freq, setFreq]       = useState(template.frequency);
  const [fromYear,  setFromYear]  = useState(template.activeFromYear);
  const [fromMonth, setFromMonth] = useState(template.activeFromMonth);

  function openEdit() {
    setDesc(template.description);
    setAmount(String(template.amount));
    setCatId(String(template.categoryId));
    setFreq(template.frequency);
    setFromYear(template.activeFromYear);
    setFromMonth(template.activeFromMonth);
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
    });
    setEditing(false);
  }

  const cat = categories.find((c) => c.id === template.categoryId);

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

  return (
    <Card>
      <CardHeader><CardTitle>{t("settings.appearance")}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
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

export function Settings() {
  const { data: categories } = useCategories();
  const { data: templates } = useRecurringTemplates();
  const createTemplate = useCreateTemplate();
  const bulkActiveFrom = useBulkActiveFrom();
  const { t } = useTranslation();

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
    });
    setTDesc(""); setTAmount(""); setTCatId("");
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
                  <th className="text-left py-2 pr-4 font-medium">{t("settings.color")}</th>
                  <th className="text-left py-2 font-medium">{t("settings.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(categories ?? []).map((cat) => <CategoryRow key={cat.id} cat={cat} />)}
              </tbody>
            </table>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">{t("settings.addCategory")}</p>
            <NewCategoryForm />
          </div>
        </CardContent>
      </Card>

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
                <Select value={tCatId} onChange={(e) => setTCatId(e.target.value)} required className="w-40">
                  <option value="">{t("transactionForm.selectCategory")}</option>
                  {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
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
