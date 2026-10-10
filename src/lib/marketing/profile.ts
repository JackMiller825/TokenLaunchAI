import type { DraftFact, FactStatusName } from "../research/types";

export type GroundedProfile = {
  name: string | null;
  ticker: string | null;
  tagline: string | null;
  description: string | null;
  narrative: string | null;
  category: string | null;
  theme: string | null;
  blockchain: string | null;
  blockchainStatus: FactStatusName | "MISSING";
  website: string;
  contract: string | null;
  contractStatus: FactStatusName | "MISSING";
  supply: string | null;
  supplyStatus: FactStatusName | "MISSING";
  buyTax: string | null;
  sellTax: string | null;
  liquidityStatus: string | null;
  liquidityFactStatus: FactStatusName | "MISSING";
  ownershipStatus: string | null;
  launchStatus: string | null;
  launchAt: string | null;
  telegram: string | null;
  x: string | null;
  discord: string | null;
  disclaimer: string | null;
  logo: string | null;
  mascot: string | null;
  missing: string[];
  unresolved: { label: string; status: string; notes: string | null }[];
};

export function groundedProfile(facts: DraftFact[], website: string): GroundedProfile {
  const pick = (key: string) => facts.find((fact) => fact.fieldKey === key);
  const value = (key: string) => pick(key)?.value ?? null;
  const status = (key: string) => pick(key)?.status ?? "MISSING";
  const missing = facts
    .filter((fact) => fact.status === "MISSING" || fact.status === "CONFLICTING" || fact.status === "NEEDS_CONFIRMATION")
    .map((fact) => fact.label);
  return {
    name: value("identity.name"),
    ticker: value("identity.ticker"),
    tagline: value("identity.tagline"),
    description: value("identity.description"),
    narrative: value("identity.narrative"),
    category: value("identity.category"),
    theme: value("identity.theme"),
    blockchain: value("identity.blockchain"),
    blockchainStatus: status("identity.blockchain"),
    website,
    contract: value("token.contract"),
    contractStatus: status("token.contract"),
    supply: value("token.totalSupply"),
    supplyStatus: status("token.totalSupply"),
    buyTax: value("token.buyTax"),
    sellTax: value("token.sellTax"),
    liquidityStatus: value("token.liquidityStatus"),
    liquidityFactStatus: status("token.liquidityStatus"),
    ownershipStatus: value("token.ownershipStatus"),
    launchStatus: value("token.launchStatus"),
    launchAt: value("token.launchAt"),
    telegram: value("social.telegram"),
    x: value("social.x"),
    discord: value("social.discord"),
    disclaimer: value("identity.disclaimer"),
    logo: value("identity.logo"),
    mascot: value("identity.mascot"),
    missing,
    unresolved: facts
      .filter((fact) => fact.status !== "VERIFIED")
      .map((fact) => ({ label: fact.label, status: fact.status, notes: fact.conflictNotes })),
  };
}

export function displayName(profile: GroundedProfile) {
  return profile.name || "This project";
}

export function tickerLabel(profile: GroundedProfile) {
  return profile.ticker ? `$${profile.ticker.replace(/^\$/, "")}` : null;
}
