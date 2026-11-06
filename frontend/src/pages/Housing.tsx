import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useHousingSummary, useYearLocks, useHouses, useAppSetting, useSetAppSetting } from "@/api/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { HousingTable } from "./Yearly";
import { fmt } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Housing() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: housing } = useHousingSummary(year);
  const { data: yearLocks } = useYearLocks(year);
  const { data: houses } = useHouses();
  const { data: primarySetting } = useAppSetting("primary_house_id");
  const setSetting = useSetAppSetting();
  const qc = useQueryClient();
  const lockedMonths = new Set(yearLocks?.lockedMonths ?? []);
  const { t } = useTranslation();

  const primaryHouseId = primarySetting?.value ? parseInt(primarySetting.value) : houses?.[0]?.id;

  const months = t("months", { returnObjects: true }) as string[];
  const now = new Date();
  const currentMonth = year === now.getFullYear() ? now.getMonth() + 1 : 0;

  // Average across months that actually have housing costs booked.
  const monthsWithData = (housing?.monthly ?? []).filter((v) => v !== 0).length || 1;
  const monthlyAvg = housing ? housing.total / monthsWithData : 0;

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 size={22} className="text-primary" />{t("housing.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}><ChevronLeft size={14} /></Button>
          <span className="min-w-16 text-center font-semibold text-lg">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}><ChevronRight size={14} /></Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-2">{t("housing.pageHint")}</p>

      {(houses ?? []).length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">{t("housing.primaryResidence")}</label>
          <Select
            value={primaryHouseId ? String(primaryHouseId) : ""}
            onChange={(e) => setSetting.mutate({ key: "primary_house_id", value: e.target.value }, { onSuccess: () => qc.invalidateQueries({ queryKey: ["summary"] }) })}
            className="w-56 h-8"
          >
            {(houses ?? []).map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">{t("housing.yearTotal")}</p>
          <p className="text-2xl font-bold tabular-nums">{fmt(housing?.total ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">{t("housing.monthlyAvg")}</p>
          <p className="text-2xl font-bold tabular-nums">{fmt(monthlyAvg)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">{t("housing.includedCount")}</p>
          <p className="text-2xl font-bold tabular-nums">{housing?.categories.length ?? 0}</p>
        </CardContent></Card>
      </div>

      {housing && (
        <HousingTable housing={housing} months={months} currentMonth={currentMonth} lockedMonths={lockedMonths} />
      )}
    </div>
  );
}
