import { displayName, type GroundedProfile } from "./profile";
import type { DraftFact } from "../research/types";

export type IntelligenceDoc = {
  generator: "rules" | "openai";
  sections: { id: string; title: string; body: string }[];
  audiences: { name: string; why: string; evidence: string }[];
};

export function buildIntelligence(profile: GroundedProfile, facts: DraftFact[], generator: "rules" | "openai" = "rules"): IntelligenceDoc {
  const name = displayName(profile);
  const verified = facts.filter((fact) => fact.status === "VERIFIED").map((fact) => fact.label);
  const reported = facts.filter((fact) => fact.status === "REPORTED_UNVERIFIED").map((fact) => `${fact.label}: ${fact.value}`);
  return {
    generator,
    sections: [
      {
        id: "identity",
        title: "Project identity",
        body: `${name}${profile.ticker ? ` (${profile.ticker})` : ""}. ${profile.description || "No short description was extracted."} Website: ${profile.website}.`,
      },
      { id: "narrative", title: "Token narrative", body: profile.narrative || "No narrative was extracted from the site." },
      {
        id: "meme",
        title: "Main meme or cultural reference",
        body: profile.theme || "No theme was extracted. Do not invent a celebrity or brand tie.",
      },
      {
        id: "audience",
        title: "Target audience",
        body: "Audience notes below are categories that fit the site's language. They are not measured demand.",
      },
      {
        id: "positioning",
        title: "Community positioning",
        body:
          profile.disclaimer ||
          `${name} should be described only as the website describes it. Official community links still need operator confirmation.`,
      },
      { id: "strengths", title: "Branding strengths", body: strengths(profile) },
      { id: "weaknesses", title: "Branding weaknesses", body: weaknesses(profile) },
      {
        id: "memetic",
        title: "Memetic potential",
        body: profile.tagline
          ? `The site already gives people a repeatable line: “${profile.tagline}”. Use that instead of a new joke that the site does not support.`
          : "No tagline was extracted, so memetic potential is unknown.",
      },
      { id: "conversion", title: "Website conversion readiness", body: conversion(profile) },
      {
        id: "opportunities",
        title: "Marketing opportunities",
        body: "Owned Telegram updates, a confirmed X post, and sponsorships only after a quote and a policy check. Paid reach is not assumed.",
      },
      { id: "credibility", title: "Credibility and transparency risks", body: credibility(profile, reported) },
      { id: "improvements", title: "Recommended improvements", body: improvements(profile, verified) },
    ],
    audiences: audiences(profile),
  };
}

function strengths(profile: GroundedProfile) {
  const items: string[] = [];
  if (profile.description) items.push("The homepage has a description that can be quoted.");
  if (profile.tagline) items.push("There is a short tagline.");
  if (profile.logo || profile.mascot) items.push("At least one visual asset URL was found.");
  if (profile.disclaimer) items.push("The site includes language that limits how the joke should be read.");
  return items.length ? items.join(" ") : "No branding strength was extracted beyond the website URL.";
}

function weaknesses(profile: GroundedProfile) {
  const items: string[] = [];
  if (profile.contractStatus !== "VERIFIED") items.push("The contract is not verified.");
  if (!profile.telegram) items.push("An official Telegram was not confirmed.");
  if (profile.liquidityFactStatus !== "VERIFIED" && profile.liquidityStatus)
    items.push("Liquidity wording on the site is not on-chain proof.");
  if (!profile.launchAt && !profile.launchStatus) items.push("Launch timing is missing.");
  return items.length ? items.join(" ") : "No specific branding weakness was extracted. Recheck after the next scan.";
}

function conversion(profile: GroundedProfile) {
  if (!profile.description) return "The page did not yield a clear explanation, so a new visitor may not know what the project is.";
  if (profile.contractStatus !== "VERIFIED")
    return "The story may be readable, but a visitor still cannot verify a contract. Do not send paid traffic to a buy button.";
  return "A description and a verified contract exist. Check that the trading link, if any, matches that contract before advertising it.";
}

function credibility(profile: GroundedProfile, reported: string[]) {
  const head = reported.slice(0, 6).join("; ");
  return `${profile.contractStatus === "VERIFIED" ? "Contract check succeeded on the configured RPC." : "Do not present website tokenomics as settled."} ${head ? `Unverified or reported fields include: ${head}.` : "No reported-unverified fields were stored."}`;
}

function improvements(profile: GroundedProfile, verified: string[]) {
  const steps = [
    "Confirm or correct each research row.",
    "Set a launch time if you know it.",
    "Connect the Telegram bot only for communities you administer.",
  ];
  if (profile.contractStatus !== "VERIFIED") steps.unshift("Publish or verify the contract before paid promotion.");
  if (!verified.length)
    steps.push("Nothing from the site is marked verified except facts this desk fetched itself, such as the final URL.");
  return steps.join(" ");
}

function audiences(profile: GroundedProfile) {
  const rows = [
    {
      name: "Ethereum meme-token readers",
      why: "The site uses meme-token language and, where stated, an Ethereum setting.",
      evidence: profile.category || profile.blockchain || "Limited evidence.",
    },
    {
      name: "People who like the site's specific joke",
      why: profile.theme || "Only if the extracted theme actually matches them.",
      evidence: profile.tagline || profile.description || "No tagline extracted.",
    },
    {
      name: "On-chain analysts",
      why: "They will look for a contract and liquidity proof. Send them only if those exist.",
      evidence: profile.contractStatus,
    },
    {
      name: "Uniswap traders",
      why: "Relevant only after a verified pool link exists. None is assumed.",
      evidence: "Trading links are included only when extracted.",
    },
  ];
  if (profile.theme?.includes("AI")) {
    rows.push({
      name: "AI and technology enthusiasts",
      why: "The site's own words mention AI or robotics. That is topical overlap, not proof they will join.",
      evidence: profile.theme,
    });
  }
  return rows;
}
