export type FactStatusName = "VERIFIED" | "REPORTED_UNVERIFIED" | "MISSING" | "CONFLICTING" | "NEEDS_CONFIRMATION";

export type Evidence = {
  sourceUrl: string;
  sourceType: string;
  excerpt: string | null;
};

export type DraftFact = {
  fieldKey: string;
  label: string;
  value: string | null;
  status: FactStatusName;
  confidence: number;
  sourceUrl: string | null;
  sourceType: string | null;
  excerpt: string | null;
  conflictNotes: string | null;
  evidence: Evidence[];
};

export type AssetCandidate = {
  url: string;
  role: string;
  usage: string;
  sourceUrl: string;
};

export type ResearchDocument = {
  url: string;
  statusCode: number;
  html: string;
  scriptText?: string;
  renderedWith: "http" | "script" | "playwright";
  error?: string;
};

export type ResearchPack = {
  canonicalUrl: string;
  domain: string;
  facts: DraftFact[];
  assets: AssetCandidate[];
  prose: string[];
  routes: string[];
  promptInjection: boolean;
};
