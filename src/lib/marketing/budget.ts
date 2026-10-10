export type BudgetItem = {
  key: string;
  label: string;
  percent: number;
  amount: number;
};

export type BudgetPlan = {
  currency: "USD";
  total: number;
  items: BudgetItem[];
  assumptions: string[];
  generator: "rules" | "performance";
};

const BASE = [
  { key: "telegram_sponsorships", label: "Telegram channel sponsorships", percent: 45 },
  { key: "telegram_ads", label: "Eligible official Telegram Ads", percent: 15 },
  { key: "creators", label: "Creator collaborations", percent: 15 },
  { key: "creative", label: "Creative production", percent: 10 },
  { key: "testing", label: "Testing", percent: 10 },
  { key: "contingency", label: "Contingency", percent: 5 },
];

export function defaultBudget(total: number): BudgetPlan {
  return {
    currency: "USD",
    total: round(total),
    items: withAmounts(BASE, total),
    generator: "rules",
    assumptions: [
      "This is a planning split, not a forecast of joins or trading.",
      "The Telegram Ads line is a reserve. Spend it only if the current platform rules allow the specific ad and you approve the spend.",
      "Sponsorship amounts stay unspent until a quote is stored and approved.",
      "No completed campaign performance was applied.",
    ],
  };
}

export function reoptimizeBudget(total: number, measured: { channel: string; costPerSubscriber: number }[]): BudgetPlan {
  if (!measured.length) {
    const plan = defaultBudget(total);
    plan.assumptions.unshift("Re-optimize found no measured cost per subscriber, so the split was left unchanged.");
    return plan;
  }
  const usable = measured.filter((row) => Number.isFinite(row.costPerSubscriber) && row.costPerSubscriber > 0);
  if (!usable.length) return defaultBudget(total);
  const best = [...usable].sort((a, b) => a.costPerSubscriber - b.costPerSubscriber)[0];
  const items = BASE.map((item) => ({ ...item }));
  const sponsor = items.find((item) => item.key === "telegram_sponsorships");
  const testing = items.find((item) => item.key === "testing");
  if (sponsor && testing && /sponsor|telegram/i.test(best.channel)) {
    sponsor.percent += 5;
    testing.percent -= 5;
  }
  return {
    currency: "USD",
    total: round(total),
    items: withAmounts(items, total),
    generator: "performance",
    assumptions: [
      `Shifted 5 points toward the lowest measured cost per subscriber (${best.channel}: $${best.costPerSubscriber.toFixed(2)}).`,
      "Past cost per subscriber is not a promise that the next placement will match it.",
      "Contingency and the ads reserve were not treated as performance channels.",
    ],
  };
}

export function applyPercents(total: number, percents: { key: string; percent: number }[]): BudgetPlan {
  const sum = percents.reduce((totalPercent, item) => totalPercent + item.percent, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error("Budget percents must add up to 100.");
  }
  const items = BASE.map((item) => {
    const found = percents.find((percent) => percent.key === item.key);
    return { ...item, percent: found?.percent ?? 0 };
  });
  return {
    currency: "USD",
    total: round(total),
    items: withAmounts(items, total),
    generator: "rules",
    assumptions: ["Percents were edited by an operator. Amounts are that percent of the current project budget."],
  };
}

export function impressionScenarios(averageViews: number | null) {
  if (averageViews == null) {
    return { low: null, mid: null, high: null, assumptions: ["Average views are unknown, so impressions are not estimated."] };
  }
  return {
    low: Math.round(averageViews * 0.5),
    mid: averageViews,
    high: Math.round(averageViews * 1.2),
    assumptions: ["Low and high are bands around the last observed average views. They are not a delivery guarantee."],
  };
}

export function subscriberScenario(priceUsd: number | null, averageViews: number | null, assumedJoinsPerThousand: number | null) {
  if (priceUsd == null || averageViews == null || assumedJoinsPerThousand == null) {
    return {
      costPerSubscriber: null,
      assumptions: [
        "Cost per subscriber stays unknown until a price, observed views, and an explicit join-rate assumption are all present.",
      ],
    };
  }
  const joins = (averageViews / 1000) * assumedJoinsPerThousand;
  if (joins <= 0)
    return { costPerSubscriber: null, assumptions: ["The join assumption produces zero joins, so cost per subscriber is undefined."] };
  return {
    costPerSubscriber: round(priceUsd / joins),
    assumptions: [
      `Assumes ${assumedJoinsPerThousand} joins per 1,000 observed views. That rate was entered by an operator. It is not a historical result.`,
    ],
  };
}

function withAmounts(items: { key: string; label: string; percent: number }[], total: number): BudgetItem[] {
  return items.map((item) => ({ ...item, amount: round((total * item.percent) / 100) }));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
