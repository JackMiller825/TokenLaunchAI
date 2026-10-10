"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

export type Fact = {
  id: string;
  fieldKey: string;
  label: string;
  value: string | null;
  originalValue: string | null;
  status: string;
  confidence: number;
  sourceUrl: string | null;
  sourceType: string | null;
  excerpt: string | null;
  conflictNotes: string | null;
  accepted: boolean;
  isPrivate: boolean;
  evidence?: { sourceUrl: string; excerpt: string | null; sourceType: string }[];
};

export const FACT_STATUS: Record<string, string> = {
  VERIFIED: "Verified",
  REPORTED_UNVERIFIED: "Reported but unverified",
  MISSING: "Missing",
  CONFLICTING: "Conflicting",
  NEEDS_CONFIRMATION: "Requires manual confirmation",
};

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    enabled: process.env.NEXT_PUBLIC_STATIC_HOST !== "1",
    queryFn: async () => {
      const response = await fetch("/api/bootstrap");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load the desk.");
      return body as {
        user: { id: string; name: string; email: string; role: string };
        projects: { id: string; name: string; websiteUrl: string | null; ticker: string | null; status: string }[];
        activeProjectId: string | null;
        notifications: { id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string }[];
        organization: {
          name: string;
          timezone: string;
          currency: string;
          retentionDays: number;
          members: { id: string; role: string; email: string; name: string }[];
        } | null;
      };
    },
  });
}

export function useProject() {
  const boot = useBootstrap();
  const id = boot.data?.activeProjectId;
  const query = useQuery({
    queryKey: ["project", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load the project.");
      return body as ProjectPayload;
    },
  });
  return { boot, projectId: id, ...query };
}

export type ProjectPayload = {
  project: {
    id: string;
    name: string;
    websiteUrl: string | null;
    budgetUsd: number;
    launchAt: string | null;
    timezone: string;
    objectives: string | null;
    channels: string[];
    category: string | null;
    telegramTarget: string | null;
    budgetPlan: {
      total: number;
      assumptions: string[];
      items: { key: string; label: string; percent: number; amount: number }[];
      generator: string;
    } | null;
    audiences: string[];
    languages: string[];
    countries: string[];
  };
  facts: Fact[];
  profile: {
    name: string | null;
    ticker: string | null;
    tagline: string | null;
    description: string | null;
    narrative: string | null;
    theme: string | null;
    contractAddress: string | null;
  } | null;
  strategy: { generator: string; model: string | null; warnings: string[]; content: StrategyContent; version: number } | null;
  intelligence: {
    generator: string;
    content: { sections: { id: string; title: string; body: string }[]; audiences: { name: string; why: string; evidence: string }[] };
  } | null;
  opportunities: Opportunity[];
  drafts: Draft[];
  assets: Asset[];
  campaigns: { id: string; name: string; objective: string | null; status: string; budgetUsd: number }[];
  tasks: Task[];
  readiness: Readiness[];
  readinessScore: number;
  metrics: Metric[];
  approvals: Approval[];
  reports: { id: string; kind: string; title: string; createdAt: string }[];
};

export type StrategyContent = {
  generator: string;
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
  prelaunch: {
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
  }[];
  launch: { channel: string; message: string; requiresConfirmation: string[] }[];
  postlaunch: { theme: string; actions: string[] }[];
  risks: { area: string; assessment: string; mitigation: string }[];
  assumptions: string[];
};

export type Opportunity = {
  id: string;
  name: string;
  telegramUrl: string | null;
  category: string | null;
  language: string | null;
  subscribers: number | null;
  averageViews: number | null;
  engagement: number | null;
  contact: string | null;
  priceUsd: number | null;
  cpmUsd: number | null;
  relevance: number | null;
  relevanceNotes: string | null;
  freshness: string | null;
  riskFlags: string[];
  recommendation: string | null;
  rankScore: number | null;
  rankConfidence: number | null;
  rankExplanation: string | null;
  status: string;
  sourceLabel: string;
  sourceUrl: string | null;
  saved: boolean;
  proofUrl: string | null;
};

export type Draft = {
  id: string;
  kind: string;
  tone: string;
  title: string;
  body: string;
  charCount: number;
  warnings: string[];
  footnotes: string[];
  status: string;
  generator: string;
};
export type Asset = {
  id: string;
  role: string;
  previewUrl: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  bytes: number | null;
  usage: string | null;
  availability: string;
  qualityNotes: string | null;
  approved: boolean;
  prompt: string | null;
  filename: string | null;
};
export type Task = {
  id: string;
  name: string;
  description: string | null;
  owner: string | null;
  dueAt: string | null;
  channel: string | null;
  budgetUsd: number | null;
  message: string | null;
  status: string;
  result: string | null;
  assetLabel: string | null;
};
export type Readiness = { key: string; category: string; label: string; status: string; owner: string | null; notes: string | null };
export type Metric = {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  kind: string;
  recordedAt: string;
  source: string;
  notes: string | null;
};
export type Approval = { id: string; type: string; status: string; title: string; detail: string | null; createdAt: string };

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <header className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal">{eyebrow}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">{title}</h1>
      <p className="mt-2 max-w-3xl text-muted">{text}</p>
    </header>
  );
}

export function EmptyProject() {
  return (
    <div className="panel p-8">
      <h2 className="text-2xl text-white">No project is open</h2>
      <p className="mt-2 max-w-xl text-muted">
        Analyze a token website to build a research file, a Telegram-first plan, and a launch checklist. Nothing here is filled with sample
        results.
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Analyze a website
      </Link>
    </div>
  );
}

export function Gate({ children }: { children: (payload: ProjectPayload, projectId: string) => React.ReactNode }) {
  const query = useProject();
  if (process.env.NEXT_PUBLIC_STATIC_HOST === "1") {
    return (
      <div className="panel p-8">
        <h2 className="text-2xl text-white">This desk runs on the Node server</h2>
        <p className="mt-2 max-w-xl text-muted">
          GitHub Pages published the interface. Website research, saved projects, Telegram, and approvals need the Node app with Postgres
          and Redis. On your machine, run <span className="text-white">npm run dev</span> and open port 43123.
        </p>
        <Link href="/" className="btn btn-primary mt-5">
          Back to the launch form
        </Link>
      </div>
    );
  }
  if (query.boot.isLoading || query.isLoading) return <p className="text-muted">Loading the project desk…</p>;
  if (query.boot.isError) return <p className="text-danger">The desk could not load. Refresh and try again.</p>;
  if (!query.projectId || !query.data?.project) return <EmptyProject />;
  if (query.isError) return <p className="text-danger">This project could not be loaded.</p>;
  return children(query.data, query.projectId);
}

export function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}

export async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export function useApi() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { path: string; method?: string; body?: unknown }) =>
      api(input.path, { method: input.method || "POST", body: input.body ? JSON.stringify(input.body) : undefined }),
    onSuccess: () => invalidate(),
  });
}

export function show(value: unknown) {
  if (value == null || value === "") return "Unknown";
  return String(value);
}
