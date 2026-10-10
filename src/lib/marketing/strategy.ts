import { displayName, tickerLabel, type GroundedProfile } from "./profile";

export type StrategyStage = {
  offsetHours: number;
  goal: string;
  audience: string;
  channel: string;
  suggestedPost: string;
  visualAsset: string;
  owner: string;
  expectedAction: string;
  kpi: string;
  dependencies: string[];
};

export type StrategyDoc = {
  generator: "rules" | "openai";
  model: string | null;
  executive: {
    objective: string;
    audience: string;
    positioning: string;
    channels: string[];
    timeline: string;
    budget: string;
    successMetrics: string[];
    risks: string[];
  };
  prelaunch: StrategyStage[];
  launch: { channel: string; message: string; requiresConfirmation: string[] }[];
  postlaunch: { theme: string; actions: string[] }[];
  risks: { area: string; assessment: string; mitigation: string }[];
  assumptions: string[];
};

const OFFSETS = [72, 48, 24, 12, 6, 1];

export function buildStrategy(input: {
  profile: GroundedProfile;
  budgetUsd: number;
  launchAt: string | null;
  channels: string[];
  audiences: string[];
  hoursBefore: number;
  hoursAfter: number;
  objectives: string | null;
  generator?: "rules" | "openai";
  model?: string | null;
}): StrategyDoc {
  const profile = input.profile;
  const name = displayName(profile);
  const ticker = tickerLabel(profile);
  const who = input.audiences[0] || "people who already read Ethereum meme communities and will check a website before trading";
  const channels = input.channels.length ? input.channels : ["telegram", "x"];
  const positioning = [
    profile.category ? `${name} presents itself as a ${profile.category.toLowerCase()}.` : `${name} has no extracted category.`,
    profile.theme ? `Theme from the site's language: ${profile.theme}.` : "No cultural theme was extracted.",
    profile.disclaimer
      ? `Disclaimer found on the site: ${profile.disclaimer}`
      : "No affiliation disclaimer was extracted. Do not add one that the site did not make, and do not imply an endorsement either.",
    ticker ? `Ticker on the site: ${ticker}.` : "Ticker is unknown, so do not invent one in ads.",
  ].join(" ");

  return {
    generator: input.generator ?? "rules",
    model: input.model ?? null,
    executive: {
      objective:
        input.objectives?.trim() ||
        `Get interested readers into the official Telegram with a clear view of what ${name} has and has not published, before and during launch.`,
      audience: who,
      positioning,
      channels,
      timeline: input.launchAt
        ? `Launch time entered by the operator: ${input.launchAt}. Window: ${input.hoursBefore}h before through ${input.hoursAfter}h after.`
        : "No launch time is confirmed. Pre-launch tasks stay unscheduled until you set one.",
      budget:
        input.budgetUsd > 0
          ? `$${input.budgetUsd.toLocaleString("en-US")} planning budget. This is not a forecast of results.`
          : "Budget is $0. Plan owned channels only until a spend is approved.",
      successMetrics: [
        "Confirmed official Telegram URL",
        "Approved launch message published at the time you scheduled",
        "New opted-in subscribers, if the bot is connected",
        "Sponsored posts with a recorded price and a proof URL",
        "Readiness blockers closed",
      ],
      risks: riskLines(profile, input.budgetUsd),
    },
    prelaunch: OFFSETS.map((hours) => stage(profile, hours, input.launchAt)),
    launch: [
      {
        channel: "Telegram channel",
        message: `${name}: publish the approved launch note with the website and the contract line “Not published.” until verification exists.`,
        requiresConfirmation: ["Official channel URL", "Contract, if you include one", "Launch time"],
      },
      {
        channel: "Telegram group",
        message: "Pin the anti-scam note and the FAQ. Answer contract questions with the stored status, not a guess.",
        requiresConfirmation: ["Group URL", "Admin list"],
      },
      {
        channel: "X",
        message: profile.x
          ? `Post from the account that you confirm is official (${profile.x}). Keep the post inside verified facts.`
          : "Do not post from an X account until you confirm the official handle. The research did not verify one.",
        requiresConfirmation: ["Official X account"],
      },
      {
        channel: "Website",
        message: "Recheck the homepage after the contract is published so ads and the site do not disagree.",
        requiresConfirmation: ["Website still matches the latest scan"],
      },
      {
        channel: "Notification bot",
        message: "Send only to users who opted in, and only after the message is approved.",
        requiresConfirmation: ["Bot token", "Opt-in list", "Approval"],
      },
    ],
    postlaunch: [
      {
        theme: "Community moderation",
        actions: ["Keep anti-scam note pinned", "Remove seed-phrase requests", "Do not let admins discuss fake volume"],
      },
      {
        theme: "Trading-link updates",
        actions: [
          "Add Uniswap, DEX Screener, or explorer links only after they resolve and match a verified contract",
          "Record the source URL on the fact",
        ],
      },
      { theme: "Education", actions: ["Explain how to read the contract status", "Repeat the site disclaimer if one exists"] },
      {
        theme: "Transparency",
        actions: ["Mark any changed website claim as a new scan", "Say when liquidity was not independently checked"],
      },
      { theme: "Engagement", actions: ["Use real mascot assets only", "Ask for replies that do not require a wallet"] },
      {
        theme: "Measurement",
        actions: ["Import post views and joins with their source", "Separate measured, imported, and estimated numbers"],
      },
      { theme: "Sponsorship review", actions: ["Attach proof URLs", "Compare quoted CPM only where views and price both exist"] },
      {
        theme: "Meme content",
        actions: ["Keep captions inside the site's joke", "Do not draw a different character and call it the mascot"],
      },
    ],
    risks: [
      {
        area: "Promotion costs",
        assessment:
          input.budgetUsd > 0
            ? "Spend is a cap, not a recommended media buy. Prices are unknown until a quote is stored."
            : "No paid budget is set.",
        mitigation: "Approve each quote before it is treated as booked.",
      },
      {
        area: "Audience quality",
        assessment: "Discovery ranks topical overlap. It does not prove that members will care about this token.",
        mitigation: "Start with one quoted placement or an owned Telegram post and record the actual result.",
      },
      {
        area: "Incomplete token information",
        assessment:
          profile.contractStatus === "VERIFIED"
            ? "A contract was verified on the configured RPC."
            : "Contract, launch time, or tokenomics are incomplete or unverified.",
        mitigation: "Keep those fields out of paid copy until the status changes.",
      },
      {
        area: "Impersonation",
        assessment: "Meme launches attract fake Telegram admins and lookalike sites.",
        mitigation: "Pin the researched website and refuse DMs that ask for keys.",
      },
      {
        area: "Platform rules",
        assessment: "Telegram Ads and many channel owners restrict financial promotions.",
        mitigation: "Run the local policy check and read the current Telegram Ads guidelines before spending.",
      },
      {
        area: "Reputation",
        assessment: profile.disclaimer
          ? "The site already limits how the joke should be read. Ads that go further create a trust problem."
          : "Overclaiming a celebrity, company, or burned LP story is a reputation risk.",
        mitigation: "Quote the site and label unverified claims.",
      },
      {
        area: "Financial promotion",
        assessment: "This desk does not determine legal compliance for your jurisdiction.",
        mitigation: "Do not promise returns. Get local advice before paid promotion of a token.",
      },
    ],
    assumptions: [
      "Strategy text is generated from stored facts and the budget you entered.",
      "Missing metrics are shown as unknown.",
      "No result here is a prediction of price or of how many people will buy.",
      input.generator === "openai"
        ? "An OpenAI response was accepted only after it passed schema and claim checks."
        : "OpenAI was not used for this version. The plan is a rule-based draft you can edit.",
    ],
  };
}

function stage(profile: GroundedProfile, hours: number, launchAt: string | null): StrategyStage {
  const name = displayName(profile);
  const goals: Record<number, string> = {
    72: "Publish the research summary and ask the community to confirm official links.",
    48: "Finish the pinned FAQ and the anti-scam note.",
    24: "Freeze claims that are still unverified. Approve the launch message.",
    12: "Check that admins and the notification path are ready.",
    6: "Re-read the website for changes.",
    1: "Send only the approved message, with the contract line left honest.",
  };
  return {
    offsetHours: hours,
    goal: goals[hours] || "Prepare the next approved update.",
    audience: "People already in or about to join the official Telegram.",
    channel: hours >= 24 ? "Telegram channel" : "Telegram channel and group",
    suggestedPost: `${name}: ${goals[hours]} Website: ${profile.website}. Contract: ${profile.contractStatus === "VERIFIED" && profile.contract ? profile.contract : "Not published."}`,
    visualAsset: profile.logo || profile.mascot || "No extracted logo yet. Do not substitute an unrelated character.",
    owner: hours >= 24 ? "Marketing / Community Manager" : "Owner / Launch Manager",
    expectedAction: "Reader can find the official site and see what is still unknown.",
    kpi:
      hours === 1 ? "Approved message posted, or an explicit decision to hold." : "Checklist item closed, with the source still attached.",
    dependencies: [
      launchAt ? "Launch time entered by the operator" : "Launch time still missing",
      "Facts accepted or corrected in the research report",
    ],
  };
}

function riskLines(profile: GroundedProfile, budget: number) {
  const lines = ["Unverified claims used as ad facts"];
  if (profile.contractStatus !== "VERIFIED") lines.push("Contract is not verified");
  if (!profile.telegram) lines.push("Official Telegram is not confirmed");
  if (budget === 0) lines.push("No paid media budget");
  lines.push("Channel prices are unknown until quoted");
  return lines;
}
