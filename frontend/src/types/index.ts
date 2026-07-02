export interface Category {
  id: number;
  name: string;
  type: "INCOME" | "EXPENSE" | "SAVINGS";
  subtype: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TransactionItem {
  id: number;
  transactionId: number;
  description: string;
  amount: number;
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
  notes?: string;
  isRecurringInstance: boolean;
  recurringTemplateId?: number;
  items: TransactionItem[];
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

export interface MonthlySummary {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netResult: number;
  savingsRate: number;
  categories: CategorySummary[];
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
  calculatedPayment: number;
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
