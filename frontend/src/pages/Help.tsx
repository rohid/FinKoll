import {
  HelpCircle, Tags, RefreshCw, Calendar, Pencil, Trash2, CalendarPlus,
  LayoutDashboard, BarChart3, TrendingUp, Home, Zap, Upload, Table2, Settings as SettingsIcon,
  Lock, Database, ShieldCheck, Lightbulb, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

type Step = { title: string; desc: string; where: string };
type Feature = { title: string; desc: string; points: string[] };
type Tip = { title: string; desc: string };

// Icons are mapped by position so translators only edit text.
const STEP_ICONS = [Tags, RefreshCw, Calendar, Pencil, Trash2, CalendarPlus];
const FEATURE_ICONS = [LayoutDashboard, Calendar, BarChart3, TrendingUp, Home, Zap, Upload, Table2, SettingsIcon];
const TIP_ICONS = [Lock, Database, ShieldCheck, Lightbulb];
const CYCLE_ICONS = [RefreshCw, Calendar, Pencil, Lock, CalendarPlus];

function IconChip({ icon: Icon, tone = "primary" }: { icon: LucideIcon; tone?: "primary" | "muted" }) {
  return (
    <span
      className={
        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg " +
        (tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")
      }
    >
      <Icon size={18} />
    </span>
  );
}

export function Help() {
  const { t } = useTranslation();
  const steps = t("help.quickstart.steps", { returnObjects: true }) as Step[];
  const features = t("help.features", { returnObjects: true }) as Feature[];
  const tips = t("help.tips", { returnObjects: true }) as Tip[];
  const cycle = t("help.cycle", { returnObjects: true }) as string[];

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HelpCircle size={24} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t("help.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
        </div>
      </div>

      {/* Quickstart */}
      <Card className="border-primary/30">
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-xs font-bold text-primary-foreground uppercase tracking-wide">
                {t("help.quickstart.badge")}
              </span>
              {t("help.quickstart.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">{t("help.quickstart.intro")}</p>
          </div>

          {/* Visual cycle */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3">
            {cycle.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-background border px-2.5 py-1.5 text-xs font-medium">
                  {(() => { const I = CYCLE_ICONS[i]; return <I size={13} />; })()}
                  {label}
                </span>
                {i < cycle.length - 1 && <ArrowRight size={14} className="text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* Steps */}
          <ol className="space-y-4">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? Tags;
              return (
                <li key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-primary flex-shrink-0" />
                      <h3 className="font-semibold text-sm">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{step.desc}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <ArrowRight size={11} /> {step.where}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Feature reference */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("help.featuresTitle")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? LayoutDashboard;
            return (
              <Card key={i}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <IconChip icon={Icon} />
                    <div>
                      <h3 className="font-semibold text-sm">{f.title}</h3>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {f.points.map((p, j) => (
                      <li key={j} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary/60" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tips */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t("help.tipsTitle")}</h2>
        <div className="space-y-3">
          {tips.map((tip, i) => {
            const Icon = TIP_ICONS[i] ?? Lightbulb;
            return (
              <div key={i} className="flex gap-3 rounded-lg border bg-muted/20 p-3">
                <IconChip icon={Icon} tone="muted" />
                <div>
                  <h3 className="font-semibold text-sm">{tip.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{tip.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
