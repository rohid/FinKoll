import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";
import type {
  Category, Transaction, BudgetPlan, RecurringTemplate,
  MonthlySummary, YearlySummary, YearlyDetailed, House, ElectricityReading,
  ElectricitySettings, ElectricityInput, ElectricityYearly,
} from "../types";

// Auth
export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => api.get("/auth/me").then((r) => r.data), retry: false });

// Categories
export const useCategories = () =>
  useQuery<Category[]>({ queryKey: ["categories"], queryFn: () => api.get("/categories").then((r) => r.data) });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Category>) => api.post("/categories", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Category> & { id: number }) =>
      api.put(`/categories/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
};

// Transactions
export const useTransactions = (year: number, month: number) =>
  useQuery<Transaction[]>({
    queryKey: ["transactions", year, month],
    queryFn: () => api.get("/transactions", { params: { year, month } }).then((r) => r.data),
  });

export const useCreateTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Transaction, "id" | "categoryName" | "categoryType" | "categoryColor" | "isRecurringInstance" | "items"> & { items?: { description: string; amount: number }[] }) =>
      api.post("/transactions", data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      const month = parseInt(vars.date.substring(5, 7));
      const year = parseInt(vars.date.substring(0, 4));
      qc.invalidateQueries({ queryKey: ["transactions", year, month] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

export const useUpdateTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Omit<Transaction,"items">> & { id: number; items?: { description: string; amount: number }[] }) =>
      api.put(`/transactions/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

export const useDeleteTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/transactions/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

export const useClearMonth = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      api.delete("/transactions/month", { params: { year, month } }).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["transactions", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

// Budget plans
export const useBudgetPlans = (year: number, month: number) =>
  useQuery<BudgetPlan[]>({
    queryKey: ["budget", year, month],
    queryFn: () => api.get("/budget", { params: { year, month } }).then((r) => r.data),
  });

export const useUpsertBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; month: number; categoryId: number; plannedAmount: number }) =>
      api.post("/budget", data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budget", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

// Recurring templates
export const useRecurringTemplates = () =>
  useQuery<RecurringTemplate[]>({
    queryKey: ["recurring"],
    queryFn: () => api.get("/recurring").then((r) => r.data),
  });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<RecurringTemplate, "id">) => api.post("/recurring", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
};

export const useUpdateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<RecurringTemplate> & { id: number }) =>
      api.put(`/recurring/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
};

export const useDeleteTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/recurring/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
};

export const useBulkActiveFrom = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { month: number; year?: number }) =>
      api.post("/recurring/bulk-active-from", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
};

export const useApplyAllTemplates = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      api.post("/recurring/apply-all", null, { params: { year, month } }).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["transactions", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

// Summary
export const useMonthlySummary = (year: number, month: number) =>
  useQuery<MonthlySummary>({
    queryKey: ["summary", "month", year, month],
    queryFn: () => api.get("/summary/month", { params: { year, month } }).then((r) => r.data),
  });

export const useYearlySummary = (year: number) =>
  useQuery<YearlySummary>({
    queryKey: ["summary", "year", year],
    queryFn: () => api.get("/summary/year", { params: { year } }).then((r) => r.data),
  });

export const useYearlyDetailed = (year: number, enabled = true) =>
  useQuery<YearlyDetailed>({
    queryKey: ["summary", "year", "detailed", year],
    queryFn: () => api.get("/summary/year/detailed", { params: { year } }).then((r) => r.data),
    enabled,
  });

export const useTrends = (fromYear: number, toYear: number) =>
  useQuery({
    queryKey: ["summary", "trends", fromYear, toYear],
    queryFn: () => api.get("/summary/trends", { params: { fromYear, toYear } }).then((r) => r.data),
  });

// Electricity
export const useHouses = () =>
  useQuery<House[]>({
    queryKey: ["houses"],
    queryFn: () => api.get("/electricity/houses").then((r) => r.data),
  });

export const useCreateHouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post("/electricity/houses", { name }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["houses"] }); qc.invalidateQueries({ queryKey: ["electricity"] }); },
  });
};

export const useRenameHouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.patch(`/electricity/houses/${id}`, { name }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["houses"] }),
  });
};

export const useDeleteHouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/electricity/houses/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["houses"] }); qc.invalidateQueries({ queryKey: ["electricity"] }); },
  });
};

export const useElectricityYearly = (year: number) =>
  useQuery<ElectricityYearly>({
    queryKey: ["electricity-yearly", year],
    queryFn: () => api.get("/electricity/yearly", { params: { year } }).then((r) => r.data),
  });

export const useElectricity = (year: number, month: number) =>
  useQuery<{ readings: ElectricityReading[]; totals: { totalKwh: number; totalBill: number; totalEvCost: number } }>({
    queryKey: ["electricity", year, month],
    queryFn: () => api.get("/electricity", { params: { year, month } }).then((r) => r.data),
  });

export const useUpsertElectricity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ElectricityInput) => api.post("/electricity", data).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["electricity", vars.year, vars.month] });
    },
  });
};

export const useElectricitySettings = () =>
  useQuery<ElectricitySettings>({
    queryKey: ["electricity", "settings"],
    queryFn: () => api.get("/electricity/settings").then((r) => r.data),
  });

export const useUpdateElectricitySettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ElectricitySettings) => api.put("/electricity/settings", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["electricity"] }),
  });
};

// Backups
export interface BackupEntry {
  filename: string;
  label: string;
  createdAt: string;
  sizeBytes: number;
}

export const useBackups = () =>
  useQuery<BackupEntry[]>({
    queryKey: ["backups"],
    queryFn: () => api.get("/backup").then((r) => r.data),
    refetchInterval: 60_000,
  });

export const useCreateBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/backup").then((r) => r.data as BackupEntry),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
};

export const useRestoreBackup = () =>
  useMutation({
    mutationFn: (filename: string) =>
      api.post(`/backup/${encodeURIComponent(filename)}/restore`).then((r) => r.data),
  });

// App settings
export const useAllSettings = () =>
  useQuery<Record<string, string | null>>({
    queryKey: ["settings", "_all"],
    queryFn: () => api.get("/settings").then((r) => r.data),
  });

export const useAppSetting = (key: string) =>
  useQuery<{ key: string; value: string | null }>({
    queryKey: ["settings", key],
    queryFn: () => api.get(`/settings/${key}`).then((r) => r.data),
  });

export const useSetAppSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/settings/${key}`, { value }).then((r) => r.data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["settings", vars.key] }),
  });
};

// Month locks
export const useMonthLock = (year: number, month: number) =>
  useQuery<{ locked: boolean; lockedAt: string | null }>({
    queryKey: ["lock", year, month],
    queryFn: () => api.get(`/locks/${year}/${month}`).then((r) => r.data),
  });

export const useYearLocks = (year: number) =>
  useQuery<{ lockedMonths: number[] }>({
    queryKey: ["locks", year],
    queryFn: () => api.get(`/locks/${year}`).then((r) => r.data),
  });

export const useLockMonth = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      api.post(`/locks/${year}/${month}`).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lock", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["locks", vars.year] });
    },
  });
};

export const useUnlockMonth = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      api.delete(`/locks/${year}/${month}`).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lock", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["locks", vars.year] });
    },
  });
};

export interface ForecastMonth {
  month: number;
  income: number;
  expenses: number;
  savings: number;
  net: number;
  savingsRate: number;
  isForecast: boolean;
}

export interface ForecastData {
  year: number;
  currentMonth: number;
  months: ForecastMonth[];
}

export const useForecast = (year: number) =>
  useQuery<ForecastData>({
    queryKey: ["forecast", year],
    queryFn: () => api.get("/summary/forecast", { params: { year } }).then((r) => r.data),
  });

// Insights
import type { MonthInsights, SavingsBreakdown, Mortgage, MortgageScenario } from "../types";

export const useMonthInsights = (year: number, month: number) =>
  useQuery<MonthInsights>({
    queryKey: ["insights", "month", year, month],
    queryFn: () => api.get("/insights/month", { params: { year, month } }).then((r) => r.data),
  });

export const useSavingsBreakdown = (year: number) =>
  useQuery<SavingsBreakdown>({
    queryKey: ["insights", "savings", year],
    queryFn: () => api.get("/insights/savings", { params: { year } }).then((r) => r.data),
  });

// Mortgages
export const useMortgages = () =>
  useQuery<Mortgage[]>({
    queryKey: ["mortgages"],
    queryFn: () => api.get("/mortgages").then((r) => r.data),
  });

export const useCreateMortgage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Mortgage, "id" | "calculatedPayment">) =>
      api.post("/mortgages", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mortgages"] }),
  });
};

export const useUpdateMortgage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Omit<Mortgage, "calculatedPayment">> & { id: number }) =>
      api.put(`/mortgages/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mortgages"] }),
  });
};

export const useDeleteMortgage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/mortgages/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mortgages"] }),
  });
};

export const useMortgageScenario = (params: { principal: number; rate: number; years: number; baseRate?: number } | null) =>
  useQuery<MortgageScenario>({
    queryKey: ["mortgages", "scenario", params],
    queryFn: () => api.get("/mortgages/scenario", { params: {
      principal: params!.principal, rate: params!.rate,
      years: params!.years, baseRate: params!.baseRate,
    }}).then((r) => r.data),
    enabled: params !== null && params.principal > 0 && params.rate > 0,
  });

// Worksheets
export interface WorksheetMeta {
  id: number;
  name: string;
  kind: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface Worksheet extends WorksheetMeta {
  data: string;
}

export const useWorksheets = () =>
  useQuery<WorksheetMeta[]>({
    queryKey: ["worksheets"],
    queryFn: () => api.get("/worksheets").then((r) => r.data),
  });

export const useWorksheet = (id: number | null) =>
  useQuery<Worksheet>({
    queryKey: ["worksheets", id],
    queryFn: () => api.get(`/worksheets/${id}`).then((r) => r.data),
    enabled: id != null,
  });

export const useCreateWorksheet = () => {
  const qc = useQueryClient();
  return useMutation<Worksheet, any, { name: string; kind?: string; data?: string }>({
    mutationFn: (body) => api.post("/worksheets", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worksheets"] }),
  });
};

export const useUpdateWorksheet = () => {
  const qc = useQueryClient();
  return useMutation<Worksheet, any, { id: number; name?: string; kind?: string; data?: string }>({
    mutationFn: ({ id, ...body }) => api.put(`/worksheets/${id}`, body).then((r) => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["worksheets"], exact: true });
      qc.invalidateQueries({ queryKey: ["worksheets", vars.id] });
    },
  });
};

export const useDeleteWorksheet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/worksheets/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worksheets"] }),
  });
};

// SQL console
export interface SqlResult {
  readOnly: boolean;
  rowCount?: number;
  columns?: string[];
  rows?: Record<string, unknown>[];
  changes?: number;
  lastInsertRowid?: number;
  backup?: string;
}

export const useRunSql = () => {
  const qc = useQueryClient();
  return useMutation<SqlResult, any, { query: string; allowWrite?: boolean }>({
    mutationFn: ({ query, allowWrite }) =>
      api.post("/sql", { query, allowWrite }).then((r) => r.data),
    onSuccess: (res) => {
      // A write may have changed anything — refresh all cached data
      if (!res.readOnly) qc.invalidateQueries();
    },
  });
};

export const useSqlSchema = () =>
  useQuery<{ table: string; columns: { name: string; type: string }[] }[]>({
    queryKey: ["sql", "schema"],
    queryFn: () => api.get("/sql/schema").then((r) => r.data),
  });

// Import
export interface ImportMapping { label: string; categoryId: number; type: "INCOME" | "EXPENSE" | "SAVINGS"; }

export const useImportMappings = () =>
  useQuery<ImportMapping[]>({
    queryKey: ["import", "mappings"],
    queryFn: () => api.get("/import/mappings").then((r) => r.data),
  });

export const useExistingMonths = (year: number) =>
  useQuery<{ months: number[] }>({
    queryKey: ["import", "existing", year],
    queryFn: () => api.get("/import/existing-months", { params: { year } }).then((r) => r.data),
  });

export interface ImportCommitBody {
  year: number;
  forceOverwrite: boolean;
  overwriteMonths: number[];
  newCategories: { tempId: string; name: string; type: "INCOME" | "EXPENSE" | "SAVINGS"; color: string }[];
  rows: { description: string; categoryId?: number; newCategoryTempId?: string; amounts: Record<string, number> }[];
}

export interface ImportCommitResult {
  committed: boolean;
  needsConfirmation?: number[];
  inserted?: number;
  backup?: string;
  lockedMonths?: number[];
}

export const useCommitImport = () => {
  const qc = useQueryClient();
  return useMutation<ImportCommitResult, any, ImportCommitBody>({
    mutationFn: (body) => api.post("/import/commit", body).then((r) => r.data),
    onSuccess: (res) => {
      if (res.committed) qc.invalidateQueries();
    },
  });
};
