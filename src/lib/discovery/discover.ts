import { SEED_CHANNELS } from "./catalog";
import { cpm, engagementRatio, rankOpportunity, recommendationFor, relevanceFor, riskFlags, type RankWeights } from "./rank";
import { parseTelegramPage, telegramUsername } from "./telegram-public";

export type DiscoveredChannel = {
  name: string;
  username: string;
  telegramUrl: string;
  category: string;
  language: string;
  subscribers: number | null;
  subscriberSource: string | null;
  averageViews: number | null;
  viewsSource: string | null;
  engagement: number | null;
  contact: string | null;
  priceUsd: null;
  cpmUsd: number | null;
  relevance: number;
  relevanceNotes: string;
  freshness: string;
  riskFlags: string[];
  recommendation: string;
  rankScore: number;
  rankConfidence: number;
  rankExplanation: string;
  sourceLabel: string;
  sourceUrl: string;
  description: string | null;
};

export type FetchText = (url: string) => Promise<string | null>;

export async function discoverChannels(input: {
  tokenCategory: string | null;
  blockchain: string | null;
  theme: string | null;
  extraUsernames?: string[];
  weights?: RankWeights;
  fetchText: FetchText;
  search?: (query: string) => Promise<{ title: string; url: string; snippet: string }[]>;
  searchQuery?: string;
}): Promise<{ channels: DiscoveredChannel[]; notes: string[] }> {
  const notes: string[] = [];
  const wanted = new Map<string, { category: string; language: string; why: string; sourceLabel: string; sourceUrl: string }>();
  for (const seed of SEED_CHANNELS) {
    wanted.set(seed.username.toLowerCase(), {
      ...seed,
      sourceLabel: "Public channel directory",
      sourceUrl: `https://t.me/${seed.username}`,
    });
  }
  for (const name of input.extraUsernames ?? []) {
    const username = telegramUsername(name);
    if (!username) continue;
    if (!wanted.has(username.toLowerCase())) {
      wanted.set(username.toLowerCase(), {
        category: "Found on project website",
        language: "unknown",
        why: "Linked from the project site. Confirm it is official or an intended ad channel before outreach.",
        sourceLabel: "Project website",
        sourceUrl: name.startsWith("http") ? name : `https://t.me/${username}`,
      });
    }
  }
  if (input.search && input.searchQuery) {
    try {
      const results = await input.search(input.searchQuery);
      for (const result of results) {
        const username = telegramUsername(result.url) || telegramUsername(result.snippet);
        if (!username || wanted.has(username.toLowerCase())) continue;
        wanted.set(username.toLowerCase(), {
          category: "Web search",
          language: "unknown",
          why: result.snippet || result.title,
          sourceLabel: "Web search",
          sourceUrl: result.url,
        });
      }
      if (!results.length) notes.push("Web search returned no Telegram links.");
    } catch (error) {
      notes.push(`Web search failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } else {
    notes.push("Web search provider is not configured. Discovery uses the public directory, site links, and anything you import.");
  }

  const channels: DiscoveredChannel[] = [];
  await Promise.all(
    [...wanted.entries()].map(async ([username, meta]) => {
      const previewUrl = `https://t.me/${username}`;
      const historyUrl = `https://t.me/s/${username}`;
      const [previewHtml, historyHtml] = await Promise.all([input.fetchText(previewUrl), input.fetchText(historyUrl)]);
      const preview = parseTelegramPage(`${previewHtml ?? ""}\n${historyHtml ?? ""}`);
      if (!preview.title) {
        notes.push(`Skipped @${username}: public Telegram preview had no title.`);
        return;
      }
      const relevance = relevanceFor({
        category: meta.category,
        description: preview.description,
        why: meta.why,
        tokenCategory: input.tokenCategory,
        blockchain: input.blockchain,
        theme: input.theme,
      });
      const flags = riskFlags({
        subscribers: preview.subscribers,
        averageViews: preview.averageViews,
        title: preview.title,
        previewResolved: true,
      });
      const checkedAt = new Date();
      const ranked = rankOpportunity(
        {
          relevance: relevance.score,
          subscribers: preview.subscribers,
          averageViews: preview.averageViews,
          priceUsd: null,
          previewResolved: true,
          contact: emailIn(preview.description),
          checkedAt,
          riskCount: flags.length,
        },
        input.weights,
      );
      channels.push({
        name: preview.title,
        username,
        telegramUrl: previewUrl,
        category: meta.category,
        language: meta.language,
        subscribers: preview.subscribers,
        subscriberSource: preview.subscribers != null ? previewUrl : null,
        averageViews: preview.averageViews,
        viewsSource: preview.averageViews != null ? historyUrl : null,
        engagement: engagementRatio(preview.subscribers, preview.averageViews),
        contact: emailIn(preview.description),
        priceUsd: null,
        cpmUsd: cpm(null, preview.averageViews),
        relevance: relevance.score,
        relevanceNotes: `${relevance.notes} ${meta.why}`,
        freshness: checkedAt.toISOString(),
        riskFlags: flags,
        recommendation: recommendationFor({
          priceUsd: null,
          subscribers: preview.subscribers,
          averageViews: preview.averageViews,
          confidence: ranked.confidence,
        }),
        rankScore: ranked.score,
        rankConfidence: ranked.confidence,
        rankExplanation: ranked.explanation,
        sourceLabel: meta.sourceLabel,
        sourceUrl: meta.sourceUrl,
        description: preview.description,
      });
    }),
  );
  channels.sort((a, b) => b.rankScore - a.rankScore || b.rankConfidence - a.rankConfidence);
  return { channels, notes };
}

function emailIn(text: string | null) {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

export async function searchWeb(query: string, provider: string, apiKey: string) {
  if (!provider || provider === "none" || !apiKey) return [];
  if (provider === "brave") {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Brave search HTTP ${response.status}`);
    const payload = (await response.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    return (payload.web?.results ?? []).map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      snippet: result.description ?? "",
    }));
  }
  if (provider === "serper") {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: 8 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Serper HTTP ${response.status}`);
    const payload = (await response.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
    return (payload.organic ?? []).map((result) => ({ title: result.title ?? "", url: result.link ?? "", snippet: result.snippet ?? "" }));
  }
  return [];
}
