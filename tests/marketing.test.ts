import { describe, expect, it } from "vitest";
import { parseTelegramPage } from "../src/lib/discovery/telegram-public";
import { rankOpportunity } from "../src/lib/discovery/rank";
import { applyPercents, defaultBudget } from "../src/lib/marketing/budget";
import { generateDraft } from "../src/lib/marketing/copy";
import { groundedProfile } from "../src/lib/marketing/profile";
import { evaluateReadiness } from "../src/lib/marketing/readiness";
import { buildStrategy } from "../src/lib/marketing/strategy";
import { complianceWarnings } from "../src/lib/marketing/policy";
import { handleBotCommand, verifyWebhookSecret } from "../src/lib/telegram/bot";
import type { DraftFact } from "../src/lib/research/types";

const facts: DraftFact[] = [
  {
    fieldKey: "identity.name",
    label: "Token name",
    value: "MedalNerd",
    status: "REPORTED_UNVERIFIED",
    confidence: 0.8,
    sourceUrl: "https://medal.example",
    sourceType: "html",
    excerpt: "MedalNerd",
    conflictNotes: null,
    evidence: [],
  },
  {
    fieldKey: "identity.ticker",
    label: "Ticker",
    value: "NERD",
    status: "REPORTED_UNVERIFIED",
    confidence: 0.8,
    sourceUrl: "https://medal.example",
    sourceType: "html",
    excerpt: "$NERD",
    conflictNotes: null,
    evidence: [],
  },
  {
    fieldKey: "token.contract",
    label: "Contract address",
    value: null,
    status: "MISSING",
    confidence: 0.8,
    sourceUrl: "https://medal.example",
    sourceType: "scan",
    excerpt: "not published",
    conflictNotes: null,
    evidence: [],
  },
  {
    fieldKey: "token.liquidityStatus",
    label: "Liquidity status",
    value: "Burn",
    status: "REPORTED_UNVERIFIED",
    confidence: 0.3,
    sourceUrl: "https://medal.example",
    sourceType: "script",
    excerpt: "Burn",
    conflictNotes: "Not checked.",
    evidence: [],
  },
];

describe("marketing workflow", () => {
  const profile = groundedProfile(facts, "https://medal.example");

  it("does not invent a contract, price promise, or verified burn", () => {
    const strategy = buildStrategy({
      profile,
      budgetUsd: 500,
      launchAt: null,
      channels: ["telegram"],
      audiences: [],
      hoursBefore: 48,
      hoursAfter: 24,
      objectives: null,
    });
    const text = JSON.stringify(strategy);
    expect(text).not.toMatch(/0x[a-fA-F0-9]{40}/);
    expect(text.toLowerCase()).not.toContain("guaranteed");
    expect(strategy.prelaunch.map((stage) => stage.offsetHours)).toEqual([72, 48, 24, 12, 6, 1]);
    const launch = generateDraft(profile, "launch_live", "informative");
    expect(launch.body).toContain("Not published.");
    expect(launch.body.toLowerCase()).not.toContain("burned");
    const ad = generateDraft(profile, "telegram_ad", "informative");
    expect([...ad.body].length).toBeLessThanOrEqual(160);
    expect(ad.warnings.join(" ")).toMatch(/ineligible|restrict/i);
  });

  it("flags profit language and keeps budget math exact", () => {
    expect(complianceWarnings("Guaranteed 100x", "x_post").length).toBeGreaterThan(0);
    const plan = defaultBudget(500);
    expect(plan.items.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
    expect(plan.items.reduce((sum, item) => sum + item.amount, 0)).toBeCloseTo(500, 2);
    expect(() =>
      applyPercents(
        100,
        plan.items.map((item) => ({ key: item.key, percent: 10 })),
      ),
    ).toThrow(/100/);
  });

  it("lowers rank confidence when metrics are missing", () => {
    const ranked = rankOpportunity({
      relevance: 0.8,
      subscribers: null,
      averageViews: null,
      priceUsd: null,
      previewResolved: true,
      contact: null,
      checkedAt: new Date(),
      riskCount: 2,
    });
    expect(ranked.confidence).toBeLessThan(0.7);
    expect(ranked.explanation.toLowerCase()).toContain("unknown");
  });

  it("scores preparation separately from trading", () => {
    const result = evaluateReadiness({
      profile,
      websiteOk: true,
      assetCount: 1,
      draftCount: 2,
      opportunityCount: 1,
      quotedCount: 0,
      approvedCopy: false,
      botConnected: false,
      faqReady: true,
      budgetApproved: false,
      launchAt: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.blockers.some((item) => item.key === "token.launch")).toBe(true);
  });
});

describe("telegram controls", () => {
  it("rejects a missing or mismatched webhook secret", () => {
    expect(verifyWebhookSecret("secret", "secret")).toBe(true);
    expect(verifyWebhookSecret("secret", "nope")).toBe(false);
    expect(verifyWebhookSecret(undefined, "secret")).toBe(false);
  });

  it("opts in on start and reports an unpublished contract", () => {
    const start = handleBotCommand("start", { name: "MedalNerd", website: "https://medal.example", facts: [], launchAt: null }, false);
    expect(start.toLowerCase()).toContain("opt in");
    const contract = handleBotCommand(
      "contract",
      {
        name: "MedalNerd",
        website: "https://medal.example",
        facts: [{ label: "Contract address", value: null, status: "MISSING" }],
        launchAt: null,
      },
      false,
    );
    expect(contract).toBe("Not published.");
  });

  it("parses a public subscriber count and ignores a page without one", () => {
    const parsed = parseTelegramPage(
      `<div class="tgme_page_title">News</div><div class="tgme_page_extra">12 345 subscribers</div><div class="tgme_page_description">Hello</div>`,
    );
    expect(parsed.subscribers).toBe(12345);
    expect(parsed.title).toBe("News");
    expect(parseTelegramPage("<html></html>").subscribers).toBeNull();
  });
});
