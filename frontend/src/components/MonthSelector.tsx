import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

interface MonthSelectorProps {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const { t } = useTranslation();
  const months = t("months", { returnObjects: true }) as string[];

  function prev() {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  }
  function next() {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={prev}><ChevronLeft size={14} /></Button>
      <span className="min-w-32 text-center font-semibold">
        {months[month - 1]} {year}
      </span>
      <Button variant="outline" size="icon" onClick={next}><ChevronRight size={14} /></Button>
    </div>
  );
}
