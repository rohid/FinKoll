import { register } from "../registry";
import type { RunOptions, RunResult, Draft } from "../types";

const kr = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString("sv-SE")} kr`;
const kwh = (n: unknown) => `${Math.round(Number(n) || 0).toLocaleString("sv-SE")} kWh`;

// Turn a read tool's structured result into a short plain-language sentence, so the
// offline mode reads like an answer rather than raw JSON. (A real model does this
// far more fluently; this covers the handful of tools the mock routes to.)
function phrase(tool: string, data: any): string {
  if (data && typeof data.error === "string") return data.error;
  switch (tool) {
    case "get_net_worth":
      return `Your net worth is about ${kr(data.netWorth)} — ${kr(data.pensionCapital)} pension, ${kr(data.investments)} investments and ${kr(data.homeEquity)} home equity.`;
    case "get_electricity_usage":
      if (!data.monthsRecorded) return `No electricity readings recorded for ${data.year} yet.`;
      return `In ${data.year} you've averaged ${kwh(data.avgKwhPerMonth)} and ${kr(data.avgCostPerMonth)} per month across ${data.monthsRecorded} month${data.monthsRecorded > 1 ? "s" : ""} (total ${kwh(data.totalKwh)}, ${kr(data.totalCost)}).`;
    case "get_category_average":
      if (!data.monthsCovered) return `No entries found for ${data.category}.`;
      return `${data.category} averages ${kr(data.averagePerMonth)} per month over the last ${data.monthsCovered} month${data.monthsCovered > 1 ? "s" : ""}.`;
    case "get_monthly_summary": {
      const sr = Math.round(data.savingsRate > 1 ? data.savingsRate : (data.savingsRate || 0) * 100);
      return `This month: income ${kr(data.totalIncome)}, expenses ${kr(data.totalExpenses)}, savings ${kr(data.totalSavings)} — net ${kr(data.netResult)} (savings rate ${sr}%).`;
    }
    default:
      return typeof data === "string" ? data : "Here's what I found in your data.";
  }
}

// A rule-based pseudo-model: no external service, fully deterministic. Doubles as
// the offline fallback (works with no key/box) and as the test harness for the
// tool loop. A real model phrases answers far better; this just routes keywords to
// the same tools so the plumbing can be exercised end-to-end.
register({
  id: "mock",
  configured: () => true,
  run: async ({ messages, execTool }: RunOptions): Promise<RunResult> => {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = last.toLowerCase();
    const numMatch = last.replace(/\s/g, "").match(/(\d[\d.,]*)/);
    const num = numMatch ? parseFloat(numMatch[1].replace(/\./g, "").replace(",", ".")) : NaN;
    const drafts: Draft[] = [];

    if (/\b(add|lägg|lägga|registrera|spara)\b/.test(text) && !Number.isNaN(num)) {
      const house = /main|primär|huvud/.test(text) ? "main"
        : /country|land|fritid/.test(text) ? "country" : undefined;
      const catWord = ["mortgage", "bolån", "electricity", "rent", "hyra", "insurance", "försäkring",
        "groceries", "mat", "salary", "lön"].find((w) => text.includes(w)) ?? "other";
      const ymTok = text.match(/(\d{4}-\d{2})\b/);
      const month = ymTok ? ymTok[1] : (/this month|denna månad|this-month/.test(text) ? new Date().toISOString().slice(0, 7) : undefined);
      const outcome = await execTool("add_transaction", { description: catWord, amount: num, category: catWord, house, month });
      if (outcome.kind === "draft") return { text: "", drafts: [outcome.draft] };
      const err = (outcome.data as { error?: string })?.error;
      return { text: err ?? "I couldn't build that entry.", drafts };
    }

    let toolName = "get_monthly_summary";
    let args: Record<string, unknown> = {};
    if (/net worth|förmögenhet/.test(text)) toolName = "get_net_worth";
    else if (/(electric|ström|el\b)/.test(text)) toolName = "get_electricity_usage";
    else if (/average|snitt|per month|per månad/.test(text)) {
      const w = text.match(/(?:on|för|på) ([a-zåäö]+)/)?.[1];
      toolName = "get_category_average"; args = { category: w ?? "groceries" };
    }
    const outcome = await execTool(toolName, args);
    return { text: phrase(toolName, (outcome as { data: unknown }).data ?? {}), drafts };
  },
});
