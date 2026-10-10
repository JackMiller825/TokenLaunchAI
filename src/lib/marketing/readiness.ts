import type { GroundedProfile } from "./profile";

export type ReadinessInput = {
  profile: GroundedProfile;
  websiteOk: boolean;
  assetCount: number;
  draftCount: number;
  opportunityCount: number;
  quotedCount: number;
  approvedCopy: boolean;
  botConnected: boolean;
  faqReady: boolean;
  budgetApproved: boolean;
  launchAt: string | null;
};

export type ReadinessRow = {
  category: string;
  key: string;
  label: string;
  status: "complete" | "incomplete" | "blocked" | "warning";
  auto: boolean;
  owner: string;
  notes: string;
};

export function evaluateReadiness(input: ReadinessInput): {
  items: ReadinessRow[];
  score: number;
  blockers: ReadinessRow[];
  next: ReadinessRow | null;
} {
  const p = input.profile;
  const items: ReadinessRow[] = [
    row(
      "Website",
      "website.accessible",
      "Website accessible",
      input.websiteOk ? "complete" : "blocked",
      "Analyst",
      input.websiteOk ? "Last scan reached the site." : "The last scan did not fetch the site.",
    ),
    row(
      "Website",
      "website.narrative",
      "Token narrative understandable",
      p.narrative || p.description ? "complete" : "incomplete",
      "Marketing / Community Manager",
      p.narrative || p.description ? "Description extracted." : "No description extracted.",
    ),
    row(
      "Website",
      "website.links",
      "Official links working",
      p.telegram || p.x ? "warning" : "incomplete",
      "Analyst",
      "Links are present only as research. Confirm each one.",
    ),
    row(
      "Website",
      "website.assets",
      "Branding assets available",
      input.assetCount > 0 ? "complete" : "incomplete",
      "Marketing / Community Manager",
      input.assetCount ? `${input.assetCount} asset URLs stored.` : "No assets stored.",
    ),
    row(
      "Website",
      "website.claims",
      "No misleading claims in the working copy",
      "warning",
      "Owner / Launch Manager",
      "Copy warnings must be cleared by a person. The score does not assume they are fine.",
    ),
    row(
      "Token information",
      "token.name",
      "Name verified",
      p.name ? "warning" : "blocked",
      "Analyst",
      p.name ? "Name is extracted from the site. Accept it or correct it." : "Name missing.",
    ),
    row(
      "Token information",
      "token.ticker",
      "Ticker verified",
      p.ticker ? "warning" : "incomplete",
      "Analyst",
      p.ticker ? "Ticker extracted. Accept it if it matches the site." : "Ticker missing.",
    ),
    row(
      "Token information",
      "token.chain",
      "Blockchain verified",
      p.blockchainStatus === "VERIFIED" ? "complete" : p.blockchain ? "warning" : "incomplete",
      "Analyst",
      p.blockchain ? `Status: ${p.blockchainStatus}.` : "Blockchain not stated.",
    ),
    row(
      "Token information",
      "token.tokenomics",
      "Tokenomics disclosed",
      p.supply || p.buyTax ? "warning" : "incomplete",
      "Analyst",
      "Disclosure on a website is not on-chain proof.",
    ),
    row(
      "Token information",
      "token.contract",
      "Contract verified if published",
      p.contractStatus === "VERIFIED" ? "complete" : p.contract ? "blocked" : "warning",
      "Analyst",
      p.contract ? "Address exists but is not verified." : "Contract is not published. Do not invent one.",
    ),
    row(
      "Token information",
      "token.launch",
      "Launch time confirmed",
      input.launchAt ? "complete" : "blocked",
      "Owner / Launch Manager",
      input.launchAt ? "Launch time is stored." : "Set a launch time to schedule the calendar.",
    ),
    row(
      "Token information",
      "token.liquidity",
      "Liquidity claims supported by evidence",
      p.liquidityFactStatus === "VERIFIED" ? "complete" : p.liquidityStatus ? "warning" : "incomplete",
      "Analyst",
      "LP burn claims stay unverified until the LP token is read.",
    ),
    row(
      "Telegram",
      "tg.channel",
      "Official channel created",
      p.telegram ? "warning" : "incomplete",
      "Marketing / Community Manager",
      p.telegram ? "A Telegram URL was found. Confirm it is yours." : "No Telegram URL extracted.",
    ),
    row(
      "Telegram",
      "tg.group",
      "Group created",
      "incomplete",
      "Marketing / Community Manager",
      "Group creation is manual. Mark this complete when it exists.",
    ),
    row(
      "Telegram",
      "tg.admins",
      "Admins assigned",
      "incomplete",
      "Owner / Launch Manager",
      "Record admins outside this app. The bot cannot see them unless it is an admin.",
    ),
    row(
      "Telegram",
      "tg.scam",
      "Scam protection enabled",
      "incomplete",
      "Marketing / Community Manager",
      "Enable Telegram's anti-spam tools in the client. This app does not toggle them.",
    ),
    row(
      "Telegram",
      "tg.welcome",
      "Welcome message ready",
      input.draftCount > 0 ? "complete" : "incomplete",
      "Marketing / Community Manager",
      input.draftCount ? "Drafts exist." : "Generate drafts.",
    ),
    row(
      "Telegram",
      "tg.launch",
      "Launch announcement ready",
      input.approvedCopy ? "complete" : "incomplete",
      "Owner / Launch Manager",
      input.approvedCopy ? "An approved draft exists." : "Approve a launch draft before sending.",
    ),
    row(
      "Telegram",
      "tg.bot",
      "Bot configured",
      input.botConnected ? "complete" : "incomplete",
      "Owner / Launch Manager",
      input.botConnected ? "Bot token is configured." : "Bot token is not configured.",
    ),
    row(
      "Telegram",
      "tg.faq",
      "Community FAQ ready",
      input.faqReady ? "complete" : "incomplete",
      "Marketing / Community Manager",
      input.faqReady ? "FAQ draft stored." : "FAQ draft missing.",
    ),
    row(
      "Advertising",
      "ads.research",
      "Target channels researched",
      input.opportunityCount > 0 ? "complete" : "incomplete",
      "Analyst",
      input.opportunityCount ? `${input.opportunityCount} candidates stored.` : "Run discovery or import a CSV.",
    ),
    row(
      "Advertising",
      "ads.budget",
      "Budgets approved",
      input.budgetApproved ? "complete" : "incomplete",
      "Owner / Launch Manager",
      "Spend still needs an approval even if a number is saved.",
    ),
    row(
      "Advertising",
      "ads.copy",
      "Advertising copy ready",
      input.draftCount > 0 ? "warning" : "incomplete",
      "Marketing / Community Manager",
      "Drafts exist. Policy warnings still need a person.",
    ),
    row(
      "Advertising",
      "ads.creative",
      "Creative assets ready",
      input.assetCount > 0 ? "warning" : "incomplete",
      "Marketing / Community Manager",
      "License is unknown unless the site states it.",
    ),
    row(
      "Advertising",
      "ads.sponsorships",
      "Sponsorships confirmed",
      input.quotedCount > 0 ? "warning" : "incomplete",
      "Owner / Launch Manager",
      input.quotedCount ? "A quote is stored. Booking still needs approval." : "No quotes stored.",
    ),
    row(
      "Advertising",
      "ads.attribution",
      "Attribution links prepared",
      "incomplete",
      "Analyst",
      "Create a unique Telegram invite in Telegram, then paste it into metrics. This app does not mint invites without a bot that administers the chat.",
    ),
    row(
      "Advertising",
      "ads.policy",
      "Policies checked",
      "warning",
      "Owner / Launch Manager",
      "Use the Telegram Ads check. It does not submit an ad.",
    ),
    row(
      "Launch operations",
      "ops.contract",
      "Contract announcement procedure",
      p.contractStatus === "VERIFIED" ? "complete" : "incomplete",
      "Owner / Launch Manager",
      "Procedure: post the contract only after status is verified.",
    ),
    row(
      "Launch operations",
      "ops.trading",
      "Trading link verification",
      "incomplete",
      "Analyst",
      "Add a trading URL only after it matches the verified contract.",
    ),
    row("Launch operations", "ops.team", "Team availability", "incomplete", "Owner / Launch Manager", "Assign owners on the calendar."),
    row(
      "Launch operations",
      "ops.approval",
      "Announcement approval",
      input.approvedCopy ? "complete" : "blocked",
      "Owner / Launch Manager",
      "Publishing requires approval.",
    ),
    row(
      "Launch operations",
      "ops.backup",
      "Backup communication plan",
      "incomplete",
      "Marketing / Community Manager",
      "Name a second channel in case Telegram is down.",
    ),
    row(
      "Launch operations",
      "ops.pause",
      "Emergency pause procedure",
      "incomplete",
      "Owner / Launch Manager",
      "Pause means: stop scheduled sends and post the anti-scam note. No trading halt is available here.",
    ),
  ];
  const applicable = items.filter((item) => item.status !== "warning");
  const done = applicable.filter((item) => item.status === "complete").length;
  const score = applicable.length ? Math.round((done / applicable.length) * 100) : 0;
  const blockers = items.filter((item) => item.status === "blocked");
  const next = blockers[0] || items.find((item) => item.status === "incomplete") || null;
  return { items, score, blockers, next };
}

function row(category: string, key: string, label: string, status: ReadinessRow["status"], owner: string, notes: string): ReadinessRow {
  return { category, key, label, status, auto: true, owner, notes };
}
