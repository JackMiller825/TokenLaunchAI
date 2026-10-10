import { impressionScenarios, subscriberScenario } from "./budget";
import type { GroundedProfile } from "./profile";

export type AssistantLink = { href: string; label: string };

export type AssistantAnswer = {
  answer: string;
  reasons: string[];
  links: AssistantLink[];
  generator: "rules" | "openai";
};

export function answerQuestion(question: string, ctx: AssistantContext): AssistantAnswer {
  const q = question.toLowerCase();
  if (/what changed|previous scan|since the last/.test(q)) return changed(ctx);
  if (/eligible|telegram ads/.test(q)) return ads(ctx);
  if (/\$?\s*200|allocat|budget/.test(q)) return budget(ctx);
  if (/cost-?eff|sponsorship|which channel|prioriti[sz]e/.test(q)) return channel(ctx);
  if (/missing|preparation|ready|what should i do next|next/.test(q)) return next(ctx);
  if (/slow|growth/.test(q)) return growth(ctx);
  if (/improve|announcement|funny|mascot|caption/.test(q)) return copy(ctx, /funny|mascot/.test(q));
  if (/performed best|best campaign/.test(q)) return performance(ctx);
  return next(ctx);
}

export type AssistantContext = {
  profile: GroundedProfile;
  readinessScore: number;
  nextAction: string | null;
  blockers: string[];
  opportunities: {
    name: string;
    priceUsd: number | null;
    cpmUsd: number | null;
    confidence: number | null;
    recommendation: string | null;
  }[];
  metrics: { name: string; value: number | null; kind: string }[];
  changes: string[];
  budget: number;
};

function next(ctx: AssistantContext): AssistantAnswer {
  return {
    generator: "rules",
    answer: ctx.nextAction
      ? `Next: ${ctx.nextAction}. Readiness is ${ctx.readinessScore}% of applicable preparation items. That score is not a trading forecast.`
      : "No next action is stored yet. Run a website analysis first.",
    reasons: ctx.blockers.length
      ? ctx.blockers.map((item) => `Blocker: ${item}`)
      : ["No blockers are marked. Incomplete items are still listed on the readiness page."],
    links: [
      { href: "/readiness", label: "Launch readiness" },
      { href: "/analyzer", label: "Research report" },
    ],
  };
}

function channel(ctx: AssistantContext): AssistantAnswer {
  const quoted = ctx.opportunities
    .filter((item) => item.priceUsd != null && item.cpmUsd != null)
    .sort((a, b) => (a.cpmUsd ?? 0) - (b.cpmUsd ?? 0));
  if (!quoted.length) {
    return {
      generator: "rules",
      answer:
        "No sponsorship has both a price and enough view data for CPM. I will not pick a winner from missing numbers. Telegram is still the primary owned channel because you asked for a Telegram-first plan.",
      reasons: ctx.opportunities.slice(0, 3).map((item) => `${item.name}: ${item.recommendation || "Needs research."}`),
      links: [{ href: "/discovery", label: "Advertising discovery" }],
    };
  }
  const best = quoted[0];
  return {
    generator: "rules",
    answer: `${best.name} has the lowest stored CPM among quoted candidates. That is a comparison of quotes and observed views, not a promise of joins.`,
    reasons: [`Quoted CPM $${best.cpmUsd}`, `Confidence ${best.confidence ?? "unknown"}`],
    links: [{ href: "/discovery", label: "Compare candidates" }],
  };
}

function growth(ctx: AssistantContext): AssistantAnswer {
  const joins = ctx.metrics.filter((metric) => /join|subscriber/i.test(metric.name));
  if (!joins.length) {
    return {
      generator: "rules",
      answer:
        "There is no measured subscriber series stored, so I cannot say growth is slow. Import joins or connect the bot and use opt-in counts.",
      reasons: ["Missing measurements are not treated as zero performance."],
      links: [{ href: "/analytics", label: "Performance analytics" }],
    };
  }
  return {
    generator: "rules",
    answer: `Stored join metrics: ${joins.map((metric) => `${metric.name} ${metric.value ?? "unknown"} (${metric.kind})`).join("; ")}. Compare the dates on the analytics page before changing spend.`,
    reasons: ["Only stored metrics are used."],
    links: [{ href: "/analytics", label: "Performance analytics" }],
  };
}

function copy(ctx: AssistantContext, funny: boolean): AssistantAnswer {
  return {
    generator: "rules",
    answer: funny
      ? `A funny caption should stay inside the site's own line${ctx.profile.tagline ? `: “${ctx.profile.tagline}”` : ""}. I will not invent a different mascot. Open Creative Studio or the copy desk to edit the meme caption draft.`
      : "Open the launch announcement draft, keep the contract line as “Not published.” until it is verified, and clear the policy warnings before approval.",
    reasons: ["Promotional text is generated from stored facts only."],
    links: [
      { href: "/creative", label: "Creative studio" },
      { href: "/telegram", label: "Telegram copy and ads" },
    ],
  };
}

function ads(ctx: AssistantContext): AssistantAnswer {
  return {
    generator: "rules",
    answer: `Telegram Ads copy for ${ctx.profile.name || "this project"} is not marked eligible. Token promotions are often prohibited, and this desk does not submit ads. Use the checker for the 160-character limit and destination shape.`,
    reasons: [
      "Eligibility is intentionally false until Telegram's own review says otherwise.",
      "A compliant-looking community sentence is still not a disguised buy ad.",
    ],
    links: [{ href: "/telegram", label: "Official Telegram Ads planner" }],
  };
}

function budget(ctx: AssistantContext): AssistantAnswer {
  const extra = 200;
  const sponsor = Math.round(extra * 0.45);
  const reserve = extra - sponsor;
  const name = ctx.profile.name || "this project";
  return {
    generator: "rules",
    answer: `Another $200 for ${name} is not allocated automatically. A cautious split of that increment is about $${sponsor} toward a quoted Telegram sponsorship test and $${reserve} held until a quote, an eligibility check, or a measured result exists.`,
    reasons: ["No result is guaranteed.", "If you have no quote, the sponsorship portion cannot be priced."],
    links: [{ href: "/strategy", label: "Budget plan" }],
  };
}

function performance(ctx: AssistantContext): AssistantAnswer {
  const measured = ctx.metrics.filter((metric) => metric.kind === "MEASURED" && metric.value != null);
  if (!measured.length) {
    return {
      generator: "rules",
      answer: "No campaign is marked best, because no measured performance is stored.",
      reasons: ["Imported or estimated numbers are not treated as a winner."],
      links: [{ href: "/analytics", label: "Performance analytics" }],
    };
  }
  const top = [...measured].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  return {
    generator: "rules",
    answer: `Highest stored measured value is ${top.name}: ${top.value}. That is the largest recorded number, not proof that advertising caused on-chain buys.`,
    reasons: ["Compared measured metrics only."],
    links: [{ href: "/analytics", label: "Performance analytics" }],
  };
}

function changed(ctx: AssistantContext): AssistantAnswer {
  if (!ctx.changes.length) {
    return {
      generator: "rules",
      answer: "No earlier scan is available to compare, or the stored facts match the previous scan.",
      reasons: ["Comparison uses saved scans only."],
      links: [{ href: "/analyzer", label: "Website analyzer" }],
    };
  }
  return {
    generator: "rules",
    answer: `Changes since the previous scan: ${ctx.changes.slice(0, 8).join("; ")}.`,
    reasons: ["User corrections are kept even when a rescan sees the old website value."],
    links: [{ href: "/analyzer", label: "Website analyzer" }],
  };
}

export function scenarioNote(views: number | null, price: number | null, assumption: number | null) {
  return { impressions: impressionScenarios(views), subscribers: subscriberScenario(price, views, assumption) };
}
