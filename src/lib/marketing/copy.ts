import { displayName, tickerLabel, type GroundedProfile } from "./profile";
import { complianceWarnings } from "./policy";

export const DRAFT_KINDS = [
  { kind: "telegram_prelaunch", title: "Telegram pre-launch announcement" },
  { kind: "telegram_intro", title: "Telegram community introduction" },
  { kind: "narrative", title: "Token narrative explanation" },
  { kind: "launch_info", title: "Official launch information" },
  { kind: "reminder_24h", title: "24-hour launch reminder" },
  { kind: "reminder_6h", title: "6-hour launch reminder" },
  { kind: "reminder_1h", title: "1-hour launch reminder" },
  { kind: "launch_live", title: "Launch-live announcement" },
  { kind: "x_post", title: "X post" },
  { kind: "sponsorship_post", title: "Telegram sponsorship post" },
  { kind: "telegram_ad", title: "Telegram Ads draft" },
  { kind: "influencer_invite", title: "Influencer collaboration invitation" },
  { kind: "ama", title: "Community AMA announcement" },
  { kind: "faq", title: "Project FAQ" },
  { kind: "anti_scam", title: "Anti-scam notice" },
  { kind: "post_launch", title: "Post-launch update" },
  { kind: "meme_caption", title: "Community meme caption" },
  { kind: "website_cta", title: "Website call to action" },
] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number]["kind"];
export type Tone = "funny" | "cute" | "meme-heavy" | "exciting" | "informative" | "professional" | "community-focused";

export type DraftDoc = {
  kind: DraftKind;
  tone: Tone;
  title: string;
  body: string;
  footnotes: string[];
  warnings: string[];
  generator: "rules" | "openai";
};

const TONES: Tone[] = ["informative", "funny", "professional", "community-focused", "exciting", "cute", "meme-heavy"];

export function generateDraft(profile: GroundedProfile, kind: DraftKind, tone: Tone, generator: "rules" | "openai" = "rules"): DraftDoc {
  const safeTone = TONES.includes(tone) ? tone : "informative";
  const title = DRAFT_KINDS.find((item) => item.kind === kind)?.title ?? kind;
  const body = render(profile, kind, safeTone);
  const footnotes = footnotesFor(profile);
  return {
    kind,
    tone: safeTone,
    title,
    body,
    footnotes,
    warnings: complianceWarnings(body, kind),
    generator,
  };
}

export function generateDraftPack(profile: GroundedProfile, generator: "rules" | "openai" = "rules") {
  const primary = DRAFT_KINDS.map((item) => generateDraft(profile, item.kind, "informative", generator));
  const alternates = (["telegram_prelaunch", "x_post", "meme_caption", "launch_live"] as DraftKind[]).map((kind) =>
    generateDraft(profile, kind, "funny", generator),
  );
  return [...primary, ...alternates];
}

function render(profile: GroundedProfile, kind: DraftKind, tone: Tone) {
  const name = displayName(profile);
  const ticker = tickerLabel(profile);
  const named = ticker ? `${name} (${ticker})` : name;
  const site = profile.website;
  const tg = profile.telegram ? `Telegram: ${profile.telegram}` : "Telegram: not confirmed yet.";
  const contract = profile.contractStatus === "VERIFIED" && profile.contract ? `Contract: ${profile.contract}` : "Contract: Not published.";
  const launch = profile.launchAt ? `Launch time: ${profile.launchAt}` : "Launch time: not confirmed.";
  const chain = profile.blockchain ? `${profile.blockchain} (${statusPhrase(profile.blockchainStatus)})` : "Blockchain: not confirmed.";
  const tag = profile.tagline ? `Tagline from the site: “${profile.tagline}”.` : "";
  const voice = voicePrefix(tone, name);
  switch (kind) {
    case "telegram_prelaunch":
      return `${voice}${named} is preparing a Telegram-first launch.\n\n${tag}\n${clip(profile.description)}\n\nWhat is confirmed right now:\n- Website: ${site}\n- ${chain}\n- ${contract}\n- ${launch}\n- ${tg}\n\nRead the site before you share numbers. We will post the contract only after it is verified.`;
    case "telegram_intro":
      return `${voice}Welcome. This chat is for ${named}.\n\n${clip(profile.narrative || profile.description) || "The project has not published a description yet."}\n\n${profile.disclaimer ? `From the site: ${profile.disclaimer}\n\n` : ""}House rules: no seed phrases, no fake admin accounts, no price predictions from the team. Official links stay in the pinned message.`;
    case "narrative":
      return `${named}\n\n${profile.narrative || profile.description || "No narrative was extracted."}\n\nTheme reading: ${profile.theme || "Not enough on-site language to describe a theme."}\nCategory: ${profile.category || "Not stated."}\n\nThis explanation uses the website's wording. Cultural references are not endorsements.`;
    case "launch_info":
      return `Launch information for ${named}\n\n- Website: ${site}\n- ${chain}\n- ${contract}\n- ${launch}\n- Supply: ${labeled(profile.supply, profile.supplyStatus)}\n- Buy tax: ${profile.buyTax || "Unknown"}\n- Sell tax: ${profile.sellTax || "Unknown"}\n- Liquidity: ${labeled(profile.liquidityStatus, profile.liquidityFactStatus)}\n- ${tg}\n- X: ${profile.x || "Unknown"}\n\nIf a field says unverified or unknown, leave it out of paid ads.`;
    case "reminder_24h":
      return `${voice}About 24 hours of preparation remain for ${named}, if the launch time you entered is still correct.\n\n${launch}\n${contract}\n\nToday: confirm the official Telegram, finish the pinned post, and do not publish a trading link that is still empty.`;
    case "reminder_6h":
      return `${voice}Six-hour check for ${named}.\n\n${launch}\n${contract}\n\nConfirm who is online, which message is approved, and that the website still matches the pinned facts.`;
    case "reminder_1h":
      return `${voice}One-hour check for ${named}.\n\n${contract}\n${launch}\n\nPost only the approved message. If the contract is still unpublished, say that plainly.`;
    case "launch_live":
      return `${voice}${named} launch update.\n\n${contract}\nWebsite: ${site}\n${tg}\n\nTrading links are included only after they are confirmed. None are inserted automatically.`;
    case "x_post":
      return `${named}${profile.tagline ? ` — ${profile.tagline}` : ""}\n${clip(profile.description, 180)}\n${site}\n${contract}`;
    case "sponsorship_post":
      return `Sponsorship draft for ${named}. Replace bracketed notes before sending.\n\n${clip(profile.description, 220) || "[One-sentence description from the website]"}\nWebsite: ${site}\n${tg}\n${contract}\n\n[Add the channel's required disclosure. Do not add a price target.]`;
    case "telegram_ad":
      return adText(profile);
    case "influencer_invite":
      return `Hello — we are preparing the launch of ${named}.\n\nWebsite: ${site}\n${tag}\n${contract}\n\nWe are not asking you to promise returns or to imply a personal endorsement beyond what you have actually checked. If you want to talk about a collaboration, reply with your format and a quoted price. We will not treat silence as acceptance.`;
    case "ama":
      return `AMA plan for ${named}.\n\nThis is an announcement draft, not a claim that an AMA is booked.\nSuggested questions:\n- What is already published, and what is still unknown?\n- Where is the official contract, if it exists?\n- Which Telegram is official?\n- What should people ignore if a fake account copies the name?\n\n${launch}`;
    case "faq":
      return faq(profile);
    case "anti_scam":
      return `Scam note for ${named}.\n\n- The website we researched is ${site}.\n- ${contract}\n- ${tg}\n- Admins will not ask for your seed phrase, wallet password, or a “verification” payment.\n- A similar name in Telegram is not proof that an account is official.\n- Ignore messages that invent a listing time or a personal endorsement.`;
    case "post_launch":
      return `Post-launch note for ${named}.\n\nShare only what you can point to: website, verified contract, and official chat.\n${contract}\n${site}\n\nNext: moderate the chat, correct any figure that the website changed, and record actual post results. Do not describe trading activity you did not measure.`;
    case "meme_caption":
      return meme(profile, tone);
    case "website_cta":
      return `Suggested website button: “Read the token facts”\nSecondary: “Join the official Telegram”\n\nUse the Telegram button only when ${profile.telegram ? profile.telegram + " is confirmed by you." : "an official Telegram URL is confirmed. Right now it is unknown."}\nAvoid “Buy now” until a verified contract and a real trading link exist.`;
    default:
      return `${named}\n${site}`;
  }
}

function adText(profile: GroundedProfile) {
  const name = displayName(profile);
  const base = `${name}: community meme project. Read the site and check what is verified before you act. ${profile.website}`;
  return [...base].length <= 160 ? base : `${name}. Read what is verified before you act. ${profile.website}`.slice(0, 160);
}

function faq(profile: GroundedProfile) {
  const name = displayName(profile);
  return [
    `FAQ — ${name}`,
    `What is it? ${profile.description || "The website did not give a description we could extract."}`,
    `Ticker? ${tickerLabel(profile) || "Unknown."}`,
    `Chain? ${profile.blockchain ? `${profile.blockchain} (${statusPhrase(profile.blockchainStatus)})` : "Unknown."}`,
    `Contract? ${profile.contractStatus === "VERIFIED" && profile.contract ? profile.contract : "Not published."}`,
    `Supply? ${labeled(profile.supply, profile.supplyStatus)}`,
    `Liquidity? ${labeled(profile.liquidityStatus, profile.liquidityFactStatus)}`,
    `Official Telegram? ${profile.telegram || "Not confirmed."}`,
    profile.disclaimer ? `Site disclaimer: ${profile.disclaimer}` : "Site disclaimer: none extracted.",
  ].join("\n");
}

function meme(profile: GroundedProfile, tone: Tone) {
  const name = displayName(profile);
  if (!profile.tagline && !profile.theme) {
    return `${name}: caption withheld until the site gives us a real visual joke to repeat. Do not invent a mascot.`;
  }
  if (tone === "funny" || tone === "meme-heavy" || tone === "cute") {
    return `${profile.tagline || name} — fan art stays fan art. ${profile.disclaimer || "No celebrity, company, or foundation endorsement is claimed."}`;
  }
  return `${name}. ${profile.tagline || ""} Community caption only. ${profile.disclaimer || "No endorsement is claimed."}`.trim();
}

function voicePrefix(tone: Tone, name: string) {
  if (tone === "professional") return "";
  if (tone === "exciting") return `${name} update. `;
  if (tone === "community-focused") return "For the community: ";
  if (tone === "funny" || tone === "meme-heavy") return "";
  if (tone === "cute") return "";
  return "";
}

function labeled(value: string | null, status: string) {
  if (!value) return "Unknown";
  if (status === "VERIFIED") return value;
  return `${value} (${statusPhrase(status)})`;
}

function statusPhrase(status: string) {
  if (status === "VERIFIED") return "verified";
  if (status === "REPORTED_UNVERIFIED") return "website claim, not independently verified";
  if (status === "CONFLICTING") return "sources conflict";
  if (status === "NEEDS_CONFIRMATION") return "needs confirmation";
  if (status === "MISSING") return "missing";
  return status;
}

function footnotesFor(profile: GroundedProfile) {
  const notes = ["Draft uses stored research only. Missing items stay missing."];
  if (profile.contractStatus !== "VERIFIED") notes.push("Contract address is omitted until it is verified.");
  if (profile.liquidityFactStatus !== "VERIFIED") notes.push("Liquidity status is not described as verified.");
  if (profile.disclaimer) notes.push("Site disclaimer is included where it affects the claim.");
  return notes;
}

function clip(value: string | null, max = 320) {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
