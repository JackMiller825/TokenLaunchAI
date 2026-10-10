import { telegramAdEligible } from "../marketing/policy";

export const TELEGRAM_ADS_DOCS = [
  "https://ads.telegram.org/",
  "https://ads.telegram.org/getting-started",
  "https://ads.telegram.org/guidelines",
];

export async function reviewSponsoredDraft(text: string, destination: string | null, fetchImpl: typeof fetch = fetch) {
  const local = telegramAdEligible(text, destination);
  let guidelines = "Official guidelines were not refreshed during this check.";
  let fetchedAt: string | null = null;
  try {
    const response = await fetchImpl("https://ads.telegram.org/guidelines", { signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const html = await response.text();
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      guidelines = visible.slice(0, 500) || guidelines;
      fetchedAt = new Date().toISOString();
    } else {
      guidelines = `Guidelines page returned HTTP ${response.status}. Local constraints still apply.`;
    }
  } catch (error) {
    guidelines = `Could not refresh guidelines (${error instanceof Error ? error.message : "network error"}). Local constraints still apply.`;
  }
  return {
    ...local,
    sources: TELEGRAM_ADS_DOCS,
    guidelinesExcerpt: guidelines,
    guidelinesFetchedAt: fetchedAt,
    submission: "Unsupported. TokenLaunch AI does not submit ads to Telegram Ads.",
  };
}
