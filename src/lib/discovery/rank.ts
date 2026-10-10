export type RankWeights = {
  relevance: number;
  engagement: number;
  cost: number;
  credibility: number;
  freshness: number;
};

export const DEFAULT_WEIGHTS: RankWeights = {
  relevance: 0.3,
  engagement: 0.25,
  cost: 0.2,
  credibility: 0.15,
  freshness: 0.1,
};

export type RankInput = {
  relevance: number | null;
  subscribers: number | null;
  averageViews: number | null;
  priceUsd: number | null;
  previewResolved: boolean;
  contact: string | null;
  checkedAt: Date | null;
  riskCount: number;
};

export function rankOpportunity(input: RankInput, weights: RankWeights = DEFAULT_WEIGHTS) {
  const engagement = engagementScore(input.subscribers, input.averageViews);
  const cost = costScore(input.priceUsd, input.averageViews);
  const credibility = input.previewResolved ? Math.max(0.15, 0.7 - input.riskCount * 0.15 + (input.contact ? 0.1 : 0)) : null;
  const freshness = freshnessScore(input.checkedAt);
  const parts = [
    { name: "Audience relevance", weight: weights.relevance, score: input.relevance, missing: "No relevance score." },
    {
      name: "Verified engagement",
      weight: weights.engagement,
      score: engagement,
      missing: "Views or subscribers are unknown, so engagement is unscored.",
    },
    { name: "Cost efficiency", weight: weights.cost, score: cost, missing: "Price or views are unknown, so CPM is not scored." },
    { name: "Credibility", weight: weights.credibility, score: credibility, missing: "The public Telegram preview did not resolve." },
    { name: "Data freshness", weight: weights.freshness, score: freshness, missing: "This candidate has not been checked." },
  ];
  const known = parts.filter((part) => part.score != null);
  const score = known.reduce((sum, part) => sum + part.weight * (part.score as number), 0);
  const confidence = known.reduce((sum, part) => sum + part.weight, 0);
  const explanation = parts
    .map((part) =>
      part.score == null
        ? `${part.name}: unknown. ${part.missing}`
        : `${part.name}: ${Math.round(part.score * 100)} / 100, weight ${Math.round(part.weight * 100)}%.`,
    )
    .join(" ");
  return {
    score: round(score),
    confidence: round(confidence),
    explanation: `${explanation} Missing inputs lower confidence. They are not filled with optimistic defaults.`,
  };
}

export function cpm(priceUsd: number | null, averageViews: number | null) {
  if (priceUsd == null || averageViews == null || averageViews <= 0) return null;
  return round(priceUsd / (averageViews / 1000));
}

export function engagementRatio(subscribers: number | null, averageViews: number | null) {
  if (subscribers == null || averageViews == null || subscribers <= 0) return null;
  return round(averageViews / subscribers);
}

function engagementScore(subscribers: number | null, averageViews: number | null) {
  const ratio = engagementRatio(subscribers, averageViews);
  if (ratio == null) return null;
  return Math.max(0, Math.min(1, ratio / 0.25));
}

function costScore(priceUsd: number | null, averageViews: number | null) {
  const value = cpm(priceUsd, averageViews);
  if (value == null) return null;
  if (value <= 5) return 1;
  if (value <= 15) return 0.65;
  if (value <= 40) return 0.35;
  return 0.15;
}

function freshnessScore(checkedAt: Date | null) {
  if (!checkedAt) return null;
  const age = Date.now() - checkedAt.getTime();
  const day = 86_400_000;
  if (age < day) return 1;
  if (age < 7 * day) return 0.6;
  return 0.25;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function relevanceFor(input: {
  category: string | null;
  description: string | null;
  why: string;
  tokenCategory: string | null;
  blockchain: string | null;
  theme: string | null;
}) {
  const hay = `${input.category ?? ""} ${input.description ?? ""} ${input.why}`.toLowerCase();
  let score = 0.15;
  const reasons: string[] = [];
  if ((input.tokenCategory || "").toLowerCase().includes("meme") && /meme|degen|memecoin/.test(hay)) {
    score += 0.4;
    reasons.push("Channel text overlaps meme-token language.");
  }
  if (/ethereum|uniswap|dex/.test(hay) && /ethereum/i.test(input.blockchain || "")) {
    score += 0.15;
    reasons.push("Channel is in the Ethereum or DEX orbit the site mentions.");
  }
  if (/news/.test(hay)) {
    score += 0.05;
    reasons.push("News reach is broad. It is not evidence of meme-launch demand.");
  }
  if (input.theme && /ai|robot/.test(input.theme.toLowerCase()) && /ai|robot|tech/.test(hay)) {
    score += 0.15;
    reasons.push("Theme words overlap a technology audience.");
  }
  if (!reasons.length) reasons.push("Public text did not match this token's narrative closely.");
  reasons.push("Relevance is topical overlap, not measured interest.");
  return { score: Math.min(1, score), notes: reasons.join(" ") };
}

export function recommendationFor(input: {
  priceUsd: number | null;
  subscribers: number | null;
  averageViews: number | null;
  confidence: number;
}) {
  if (input.confidence < 0.5) return "Research only. Too many metrics are unknown to rank this as a buy.";
  if (input.priceUsd == null) return "Ask for a written quote and recent view screenshots before any approval to spend.";
  if (input.averageViews == null) return "Price is stored, but views are unknown, so CPM is not calculated. Do not book on price alone.";
  return "Compare this quoted CPM with other quoted channels. Booking still needs a person to approve the spend.";
}

export function riskFlags(input: {
  subscribers: number | null;
  averageViews: number | null;
  title: string | null;
  previewResolved: boolean;
}) {
  const flags: string[] = [];
  if (!input.previewResolved || !input.title) flags.push("Public preview did not confirm a channel title.");
  if (input.subscribers == null) flags.push("Subscriber count unknown.");
  if (input.averageViews == null) flags.push("Recent views unknown.");
  if (input.subscribers != null && input.averageViews != null && input.averageViews > input.subscribers * 5) {
    flags.push("Observed views are far above the reported subscriber count. Treat both numbers cautiously.");
  }
  return flags;
}
