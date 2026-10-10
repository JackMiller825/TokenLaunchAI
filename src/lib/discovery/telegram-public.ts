export type TelegramPreview = {
  title: string | null;
  description: string | null;
  extra: string | null;
  subscribers: number | null;
  members: number | null;
  averageViews: number | null;
};

export function parseTelegramPage(html: string): TelegramPreview {
  const title = text(html, /class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i);
  const description = text(html, /class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/i);
  const extra = text(html, /class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/i);
  const views = [...html.matchAll(/class="tgme_widget_message_views"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => parseCompact(strip(match[1])))
    .filter((value): value is number => value != null)
    .slice(0, 12);
  const averageViews = views.length ? Math.round(views.reduce((sum, value) => sum + value, 0) / views.length) : null;
  return {
    title,
    description,
    extra,
    subscribers: extra ? parseLabeled(extra, "subscribers") : null,
    members: extra ? parseLabeled(extra, "members") : null,
    averageViews,
  };
}

export function telegramUsername(url: string | null | undefined) {
  if (!url) return null;
  const match = url.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})/i);
  if (!match) return null;
  const name = match[1];
  if (["share", "addstickers", "joinchat", "iv"].includes(name.toLowerCase())) return null;
  return name;
}

function text(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  if (!match) return null;
  const value = strip(match[1]);
  return value || null;
}

function strip(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLabeled(extra: string, word: string) {
  const match = extra.match(new RegExp(`([\\d][\\d\\s]*?)\\s+${word}`, "i"));
  if (!match) return null;
  const value = Number(match[1].replace(/\s/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseCompact(value: string) {
  const match = value
    .replace(/,/g, "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toUpperCase();
  const multiplier = unit === "B" ? 1_000_000_000 : unit === "M" ? 1_000_000 : unit === "K" ? 1_000 : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : null;
}
