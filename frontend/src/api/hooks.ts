import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";
import type {
  Category, CategoryGroup, DataHealth, Tag, Person, Transaction, BudgetPlan, RecurringTemplate,
  MonthlySummary, YearlySummary, YearlyDetailed, HousingSummary, House, ElectricityReading,
  ElectricitySettings, ElectricityInput, ElectricityYearly,
  Holding, InvestmentSummary, PortfolioSnapshot, ProvidersInfo, SymbolHit, InvestmentAnalysis,
  PensionData, PensionHolding,
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

export const useMergeCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intoId }: { id: number; intoId: number }) =>
      api.post(`/categories/${id}/merge`, { intoId }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });
};

// Category groups (canonical taxonomy)
export const useCategoryGroups = () =>
  useQuery<CategoryGroup[]>({ queryKey: ["category-groups"], queryFn: () => api.get("/category-groups").then((r) => r.data) });

export const useCreateCategoryGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CategoryGroup>) => api.post("/category-groups", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["category-groups"] }),
  });
};

export const useUpdateCategoryGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CategoryGroup> & { id: number }) =>
      api.put(`/category-groups/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["category-groups"] }),
  });
};

export const useDeleteCategoryGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/category-groups/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-groups"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
};

// Tags
export const useTags = () =>
  useQuery<Tag[]>({ queryKey: ["tags"], queryFn: () => api.get("/tags").then((r) => r.data) });
export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Tag>) => api.post("/tags", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
};
export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Tag> & { id: number }) => api.put(`/tags/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
};
export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/tags/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tags"] }); qc.invalidateQueries({ queryKey: ["transactions"] }); },
  });
};

// People
export const usePeople = () =>
  useQuery<Person[]>({ queryKey: ["people"], queryFn: () => api.get("/people").then((r) => r.data) });
export const useCreatePerson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Person>) => api.post("/people", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
  });
};
export const useDeletePerson = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/people/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["people"] }); qc.invalidateQueries({ queryKey: ["transactions"] }); },
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
    mutationFn: (data: Omit<Transaction, "id" | "categoryName" | "categoryType" | "categoryColor" | "isRecurringInstance" | "houseId" | "items" | "tagIds"> & { items?: { description: string; amount: number; houseId?: number | null; categoryId?: number | null }[]; houseId?: number | null; tagIds?: number[] }) =>
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
    mutationFn: ({ id, ...data }: Partial<Omit<Transaction,"items">> & { id: number; items?: { description: string; amount: number; houseId?: number | null }[] }) =>
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

export const useHousingSummary = (year: number) =>
  useQuery<HousingSummary>({
    queryKey: ["summary", "housing", year],
    queryFn: () => api.get("/summary/housing", { params: { year } }).then((r) => r.data),
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

// Update a house's net-worth fields (valuation / ownership share).
export const useUpdateHouse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; valuation?: number | null; valuationAsOf?: string | null; ownershipPct?: number }) =>
      api.patch(`/electricity/houses/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["houses"] }),
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

export const useDataHealth = () =>
  useQuery<DataHealth>({
    queryKey: ["insights", "health"],
    queryFn: () => api.get("/insights/health").then((r) => r.data),
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

// Investments
export const useHoldings = () =>
  useQuery<Holding[]>({ queryKey: ["investments"], queryFn: () => api.get("/investments").then((r) => r.data) });

export const useInvestmentSummary = () =>
  useQuery<InvestmentSummary>({ queryKey: ["investments", "summary"], queryFn: () => api.get("/investments/summary").then((r) => r.data) });

export const useInvestmentHistory = () =>
  useQuery<PortfolioSnapshot[]>({ queryKey: ["investments", "history"], queryFn: () => api.get("/investments/history").then((r) => r.data) });

export const useInvestmentProviders = () =>
  useQuery<ProvidersInfo>({ queryKey: ["investments", "providers"], queryFn: () => api.get("/investments/providers").then((r) => r.data) });

export const useCreateHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Holding>) => api.post("/investments", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
};

export const useUpdateHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Holding> & { id: number }) =>
      api.put(`/investments/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
};

export const useDeleteHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/investments/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
};

export const useRefreshQuotes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/investments/refresh").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  });
};

// ── Pension ──────────────────────────────────────────────────────────────────
export const usePension = () =>
  useQuery<PensionData>({ queryKey: ["pension"], queryFn: () => api.get("/pension").then((r) => r.data) });

export const useCreatePensionHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PensionHolding>) => api.post("/pension", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pension"] }),
  });
};

export const useBulkAddPension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (holdings: Partial<PensionHolding>[]) => api.post("/pension/bulk", { holdings }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pension"] }),
  });
};

export const useUpdatePensionHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<PensionHolding> & { id: number }) =>
      api.put(`/pension/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pension"] }),
  });
};

export const useDeletePensionHolding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/pension/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pension"] }),
  });
};

export const useSymbolSearch = (query: string) =>
  useQuery<SymbolHit[]>({
    queryKey: ["investments", "search", query],
    queryFn: () => api.get("/investments/search", { params: { q: query } }).then((r) => r.data),
    enabled: query.trim().length >= 2,
  });

export const useInvestmentAnalysis = (withReturns: boolean, enabled: boolean) =>
  useQuery<InvestmentAnalysis>({
    queryKey: ["investments", "analysis", withReturns],
    queryFn: () => api.get("/investments/analysis", { params: withReturns ? { withReturns: 1 } : {} }).then((r) => r.data),
    enabled,
  });

// ── Assistant (financial copilot) ───────────────────────────────────────────────
import type { AssistantStatus, AssistantMessage, AssistantChatResponse, AssistantDraft } from "../types";

export const useAssistantStatus = () =>
  useQuery<AssistantStatus>({
    queryKey: ["assistant", "status"],
    queryFn: () => api.get("/assistant/status").then((r) => r.data),
  });

export const useAssistantHistory = () =>
  useQuery<AssistantMessage[]>({
    queryKey: ["assistant", "history"],
    queryFn: () => api.get("/assistant/history").then((r) => r.data),
  });

export const useAssistantChat = () =>
  useMutation<AssistantChatResponse, unknown, AssistantMessage[]>({
    mutationFn: (messages) => api.post("/assistant/chat", { messages }).then((r) => r.data),
  });

export const useCommitDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: AssistantDraft) => api.post("/assistant/commit", draft).then((r) => r.data),
    // A committed write can touch almost anything — refresh the common views.
    onSuccess: () => {
      for (const key of ["transactions", "summary", "pension", "houses", "electricity", "mortgages", "investments"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
};
