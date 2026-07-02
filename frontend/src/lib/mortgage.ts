// Mortgage math — annuity payment + a forward-looking forecast for the common
// (Swedish) model where you pay a FIXED monthly amortization (principal paydown)
// plus interest that moves with the rate:
//
//     monthly payment = interest on the remaining balance + fixed amortization
//
// The amortization is constant until you deliberately change it, and a change
// only affects future payments. A rate change affects only the interest portion.

export function annuityPayment(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export interface MortgageChange {
  month: number;   // whole months from now (>= 1)
  rate?: number;   // new annual rate % (optional — omit to keep the current rate)
  amort?: number;  // new fixed monthly amortization in kr (optional — omit to keep it)
}

export interface ForecastPeriod {
  atMonth: number; // months from now this change takes effect (0 = now)
  rate: number;
  amort: number;
  payment: number; // interest on the balance at that month + the amortization
}

export interface MortgageForecast {
  periods: ForecastPeriod[];
  payoffMonths: number;          // months until the balance reaches zero (forecast)
  baselineTotalInterest: number; // keeping the current rate + amortization throughout
  forecastTotalInterest: number; // following the schedule
  interestDelta: number;         // forecast − baseline (positive = costs more)
  baselinePayoffMonths: number;
}

const MAX_MONTHS = 2400; // 200-year safety cap against non-amortizing inputs

function simulate(principal: number, rate0: number, amort0: number, evts: MortgageChange[]) {
  const periods: ForecastPeriod[] = [];
  let balance = principal;
  let rate = rate0;
  let amort = amort0;
  let interestSum = 0;
  let payoff = 0;
  let ei = 0;

  periods.push({ atMonth: 0, rate, amort, payment: (balance * rate) / 1200 + amort });

  for (let m = 1; m <= MAX_MONTHS && balance > 0.005; m++) {
    while (ei < evts.length && evts[ei].month === m) {
      if (evts[ei].rate != null && evts[ei].rate! > 0) rate = evts[ei].rate!;
      if (evts[ei].amort != null && evts[ei].amort! > 0) amort = evts[ei].amort!;
      periods.push({ atMonth: m, rate, amort, payment: (balance * rate) / 1200 + amort });
      ei++;
    }
    interestSum += (balance * rate) / 1200;
    balance -= Math.min(amort, balance);
    payoff = m;
  }
  return { periods, interestSum, payoff };
}

export function forecastMortgage(
  principal: number,
  currentRate: number,
  baseAmortization: number,
  changes: MortgageChange[],
): MortgageForecast {
  const evts = changes
    .filter((c) => Number.isFinite(c.month) && c.month >= 1 &&
      ((c.rate != null && c.rate > 0) || (c.amort != null && c.amort > 0)))
    .sort((a, b) => a.month - b.month);

  const fc = simulate(principal, currentRate, baseAmortization, evts);
  const base = simulate(principal, currentRate, baseAmortization, []);

  return {
    periods: fc.periods,
    payoffMonths: fc.payoff,
    forecastTotalInterest: fc.interestSum,
    baselineTotalInterest: base.interestSum,
    interestDelta: fc.interestSum - base.interestSum,
    baselinePayoffMonths: base.payoff,
  };
}
