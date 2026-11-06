export interface Category {
  id: number;
  name: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  subtype: string;
  groupId?: number | null;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isHousing: boolean;
}

export interface HealthIssue<T> { count: number; items: T[]; }
export interface DataHealth {
  negativeAmounts: HealthIssue<{ id: number; date: string; description: string; amount: number; categoryName: string }>;
  ungroupedCategories: HealthIssue<{ id: number; name: string; type: string }>;
  duplicateCategoryNames: HealthIssue<{ name: string; ids: number[] }>;
  unusedCategories: HealthIssue<{ id: number; name: string; type: string }>;
  splitMismatches: HealthIssue<{ id: number; date: string; description: string; amount: number; itemsTotal: number }>;
  housingUnassigned: HealthIssue<{ id: number; date: string; description: string; categoryName: string }>;
  totalIssues: number;
}

export interface CategoryGroup {
  id: number;
  name: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  sortOrder: number;
}

export interface GroupSummary {
  groupId: number | null;
  groupName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  amount: number;
}

export interface TransactionItem {
  id: number;
  transactionId: number;
  description: string;
  amount: number;
  houseId?: number | null; // null = inherit the parent transaction's house
  categoryId?: number | null; // null = inherit the parent transaction's category
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Person {
  id: number;
  name: string;
  sortOrder: number;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  categoryId: number;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE" | "SAVINGS";
  categoryColor: string;
  personId?: number | null;
  payee?: string | null;
  notes?: string;
  houseId?: number | null;
  isRecurringInstance: boolean;
  recurringTemplateId?: number;
  items: TransactionItem[];
  tagIds: number[];
}

export interface BudgetPlan {
  id: number;
  year: number;
  month: number;
  categoryId: number;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE" | "SAVINGS";
  plannedAmount: number;
}

export interface RecurringTemplate {
  id: number;
  description: string;
  amount: number;
  categoryId: number;
  frequency: "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "HALFYEARLY" | "YEARLY";
  activeFromYear: number;
  activeFromMonth: number;
  activeToYear?: number;
  activeToMonth?: number;
  isActive: boolean;
  houseId?: number | null; // null = general cost (not tied to a house)
}

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  color: string;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  percentOfIncome: number;
}

export interface HousingCategoryTotal {
  categoryId: number;
  categoryName: string;
  color: string;
  amount: number;
}

export interface MonthlySummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netResult: number;
  savingsRate: number;
  categories: CategorySummary[];
  groups: GroupSummary[];
  housingTotal: number;
  housingCategories: HousingCategoryTotal[];
}

export interface HousingSummaryCategory {
  categoryId: number;
  categoryName: string;
  color: string;
  months: number[];
  total: number;
}

export interface HousingSummary {
  year: number;
  monthly: number[];
  total: number;
  categories: HousingSummaryCategory[];
}

export interface YearlySummary {
  monthlyTotals: {
    income: number[];
    expenses: number[];
    savings: number[];
    netResult: number[];
  };
  yearlyTotals: {
    income: number;
    expenses: number;
    savings: number;
    netResult: number;
    savingsRate: number;
  };
  rows: {
    categoryId: number;
    categoryName: string;
    type: "INCOME" | "EXPENSE" | "SAVINGS";
    color: string;
    months: number[];
    total: number;
  }[];
  groupRows: {
    groupId: number | null;
    groupName: string;
    type: "INCOME" | "EXPENSE" | "SAVINGS";
    color: string;
    months: number[];
    total: number;
  }[];
}

export interface YearlyDetailed {
  year: number;
  sections: {
    type: "INCOME" | "EXPENSE" | "SAVINGS";
    total: number;
    categories: {
      categoryId: number;
      categoryName: string;
      color: string;
      total: number;
      transactions: {
        id: number;
        date: string;
        description: string;
        amount: number;
        notes: string | null;
        month: number;
      }[];
    }[];
  }[];
  grandTotals: { income: number; expenses: number; savings: number; netResult: number };
}

export interface House {
  id: number;
  name: string;
  sortOrder: number;
  valuation?: number | null;      // manual market-value estimate; null = not tracked for net worth
  valuationAsOf?: string | null;  // YYYY-MM-DD the valuation was last set
  ownershipPct: number;           // your share of the property, 0–100 (default 100)
}

export interface ElectricityReading {
  id: number;
  year: number;
  month: number;
  houseId: number;
  gridSubscriptionFee: number;
  transferRatePerKwh: number;
  totalKwh: number;
  energyTaxPerKwh: number;
  pricePerKwh: number;
  tibberTotal: number;
  vatPct: number;
  evKwh: number;
  evCostVattenfall: number;
  evCostTibber: number;
  evVat: number;
  transferCost: number;
  energyTaxTotal: number;
  vattenfallTotal: number; // ex-VAT subtotal (legacy column name)
  evTotal: number;
  totalBill: number;
}

export interface ElectricityRates {
  transferRatePerKwh: number;
  energyTaxPerKwh: number;
}

export interface ElectricitySettings {
  vatPct: number;
  shared: boolean;
  sharedSubscription: boolean;
  global: ElectricityRates;
  perHouse: Record<string, ElectricityRates>;
}

export interface ElectricityInput {
  year: number;
  month: number;
  houseId: number;
  tibberTotal: number;
  totalKwh: number;
  evKwh: number;
  transferRatePerKwh: number;
  energyTaxPerKwh: number;
  gridSubscriptionFee: number;
  vatPct: number;
}

export interface ElectricityYearlyPoint {
  month: number;
  totalKwh: number;
  tibber: number;
  grid: number;
  totalBill: number;
  evKwh: number;
  evTotal: number;
}

export interface ElectricityYearly {
  year: number;
  months: ElectricityYearlyPoint[];
  totals: Omit<ElectricityYearlyPoint, "month">;
}

export interface TemplateSignal {
  categoryId: number;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE" | "SAVINGS";
  templateAmount: number;
  actualAmount: number;
  variance: number;
  variancePct: number;
  signal: "overrun" | "missing" | "under_budget" | "on_track";
}

export interface TrendObservation {
  type: string;
  severity: "good" | "warning" | "info";
  data: Record<string, string | number>;
}

export interface MonthInsights {
  signals: TemplateSignal[];
  healthScore: number;
  observations: TrendObservation[];
}

export interface SavingsCatTotal {
  categoryId: number;
  categoryName: string;
  color: string;
  amount: number;
}

export interface SavingsBreakdown {
  ytdByCat: SavingsCatTotal[];
  ytdTotal: number;
  projectedTotal: number;
  avgMonthly: number;
  monthsOfEmergencyFund: number;
  monthly: { month: number; byCat: Record<number, number> }[];
}

export interface Mortgage {
  id: number;
  name: string;
  principalAmount: number;
  interestRate: number;
  amortizationYears: number;
  monthlyPaymentOverride?: number;
  effectiveFrom: string;
  notes?: string;
  forecast?: string;
  groupName?: string;
  houseId?: number | null;   // property this loan is secured on (net worth)
  calculatedPayment: number;
}

// ── Investments ───────────────────────────────────────────────────────────────
export interface Holding {
  id: number;
  name: string;
  isin?: string | null;
  symbol?: string | null;
  assetType: "STOCK" | "FUND" | "ETF" | "OTHER";
  quantity: number;
  avgCost: number;
  currency: string;
  manualPrice?: number | null;
  source: string;
  sortOrder: number;
  notes?: string | null;
  // Enriched fields (server-computed):
  price: number;
  quoteCurrency: string;
  changePct: number;
  dayChangeSek: number;
  fxToSek: number;
  marketValueSek: number;
  costSek: number;
  gainSek: number;
  gainPct: number;
  asOf: string | null;
}

export interface ProvidersInfo {
  market: string;
  portfolio: string;
  capabilities: string[];
  portfolioCapabilities: string[];
}

export interface InvestmentSummary extends ProvidersInfo {
  totalValueSek: number;
  totalCostSek: number;
  gainSek: number;
  gainPct: number;
  dayChangeSek: number;
  dayChangePct: number;
  count: number;
  asOf: string | null;
}

export interface PortfolioSnapshot {
  date: string;
  totalValueSek: number;
  totalCostSek: number;
  gainSek: number;
}

export interface SymbolHit {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
}

// ── Pension ──────────────────────────────────────────────────────────────────
export type PensionType = "ALLMAN" | "TJANSTE" | "PRIVAT";

export interface PensionHolding {
  id: number;
  name: string;
  type: PensionType;
  manager?: string | null;
  currentValue: number;
  projectedMonthlyPayout?: number | null;
  sortOrder: number;
  notes?: string | null;
  asOf?: string | null;
}

export interface PensionSummary {
  byType: { type: PensionType; total: number; payout: number; count: number }[];
  totalCapital: number;
  totalProjectedPayout: number;
}

export interface PensionData {
  holdings: PensionHolding[];
  summary: PensionSummary;
  history: { date: string; totalValueSek: number }[];
}

// ── Assistant (financial copilot) ───────────────────────────────────────────────
export interface AssistantStatus {
  configured: boolean;
  provider: string;
}
export interface AssistantDraft {
  tool: string;
  args: Record<string, unknown>;
  preview: string;
}
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AssistantChatResponse {
  text: string;
  drafts: AssistantDraft[];
}

export interface AnalysisHolding {
  id: number;
  name: string;
  symbol?: string | null;
  currency: string;
  marketValueSek: number;
  gainPct: number;
  dayChangePct: number;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
  debtEquity: number | null;
  marketCap: number | null;
  r1m: number | null;
  r3m: number | null;
  r1y: number | null;
  fundamentalsAsOf: string | null;
}

export interface InvestmentAnalysis extends ProvidersInfo {
  holdings: AnalysisHolding[];
}

export interface MortgageScenario {
  monthlyPayment: number;
  interestPortion: number;
  amortPortion: number;
  annualTotal: number;
  basePayment?: number;
  monthlyDelta?: number;
  annualDelta?: number;
}
