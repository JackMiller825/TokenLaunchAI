import { load } from "cheerio";
import { decodeBody, safeFetch, type SafeFetchOptions } from "./safe-fetch";
import { imageRole } from "./images";
import { robotsAllows } from "./robots";
import { normalizeHttpUrl, sameSite } from "./ssrf";
import type { ResearchDocument } from "./types";

function pageDocument(input: ResearchDocument): ResearchDocument {
  return input;
}

const KEYWORDS = ["token", "tokenomics", "about", "roadmap", "community", "faq", "whitepaper", "docs", "litepaper", "buy"];
const MAX_PAGES = 8;
const MAX_SCRIPTS = 3;

export type CrawlResult = {
  canonicalUrl: string;
  domain: string;
  documents: ResearchDocument[];
  notes: string[];
};

type Fetcher = (url: string, options?: SafeFetchOptions) => Promise<{ url: string; status: number; body: Buffer; contentType: string }>;

export async function crawlSite(
  input: string,
  deps?: { fetch?: Fetcher; playwright?: (url: string) => Promise<{ html: string; text: string } | null> },
): Promise<CrawlResult> {
  const fetchImpl: Fetcher = deps?.fetch ?? ((url, options) => safeFetch(url, options));
  const start = normalizeHttpUrl(input);
  const notes: string[] = [];
  const documents: ResearchDocument[] = [];
  const robotsUrl = new URL("/robots.txt", start).toString();
  let robots = "";
  try {
    const robotsResponse = await fetchImpl(robotsUrl, { timeoutMs: 8_000, maxBytes: 200_000, accept: "text/plain,*/*" });
    if (robotsResponse.status >= 200 && robotsResponse.status < 300) robots = decodeBody(robotsResponse.body);
  } catch {
    notes.push("robots.txt could not be fetched. Crawling continued with size and depth limits.");
  }

  const home = await fetchPage(start.toString(), fetchImpl, robots, notes);
  if (!home) throw new Error("The website could not be fetched.");
  documents.push(home.document);
  const canonical = canonicalFrom(home.document) ?? home.finalUrl;
  const origin = new URL(canonical);

  const scripts = scriptUrls(home.document.html, home.finalUrl).slice(0, MAX_SCRIPTS);
  let scriptText = "";
  if (needsScript(home.document.html) && scripts.length) {
    const bundles: string[] = [];
    for (const scriptUrl of scripts) {
      if (!robotsAllows(robots, new URL(scriptUrl).pathname)) {
        notes.push(`Skipped script blocked by robots.txt: ${scriptUrl}`);
        continue;
      }
      try {
        const response = await fetchImpl(scriptUrl, {
          timeoutMs: 12_000,
          maxBytes: 2_000_000,
          accept: "application/javascript,text/javascript,*/*",
        });
        if (response.status >= 200 && response.status < 300) bundles.push(decodeBody(response.body));
      } catch (error) {
        notes.push(`Script fetch failed for ${scriptUrl}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    scriptText = bundles.join("\n");
    if (scriptText) {
      home.document.scriptText = scriptText;
      home.document.renderedWith = "script";
      notes.push("Homepage looked like a client-rendered shell, so same-origin script bundles were read as data.");
    }
  }

  const queue = new Map<string, number>();
  for (const link of discoverLinks(home.document.html, home.finalUrl, scriptText)) {
    queue.set(link, scorePath(link));
  }
  try {
    const sitemapUrl = new URL("/sitemap.xml", origin).toString();
    if (robotsAllows(robots, "/sitemap.xml")) {
      const sitemap = await fetchImpl(sitemapUrl, { timeoutMs: 8_000, maxBytes: 500_000, accept: "application/xml,text/xml,*/*" });
      if (sitemap.status >= 200 && sitemap.status < 300) {
        for (const match of decodeBody(sitemap.body).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
          try {
            const url = new URL(match[1].trim());
            if (sameSite(origin, url)) queue.set(url.toString(), scorePath(url.toString()) + 1);
          } catch {
            /* skip bad sitemap loc */
          }
        }
      }
    }
  } catch {
    notes.push("Sitemap was not available.");
  }

  const ordered = [...queue.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .filter((url) => url !== home.finalUrl && url !== canonical)
    .slice(0, MAX_PAGES - 1);

  const workers = ordered.map(async (url) => {
    const page = await fetchPage(url, fetchImpl, robots, notes);
    if (page) documents.push(page.document);
  });
  await Promise.all(workers);

  const visible = visibleText(home.document.html);
  if (visible.length < 80 && !scriptText && deps?.playwright) {
    const rendered = await deps.playwright(canonical);
    if (rendered?.html) {
      documents.push({
        url: canonical,
        statusCode: 200,
        html: rendered.html,
        renderedWith: "playwright",
      });
      notes.push("Playwright rendered the homepage because the HTTP response had almost no visible text.");
    } else {
      notes.push("Browser rendering was not available. Extraction used the HTTP response only.");
    }
  } else if (visible.length < 80 && !scriptText) {
    notes.push(
      "The page has little visible HTML and browser rendering is disabled. Set PLAYWRIGHT_ENABLED=1 after installing Chromium if a site hides its copy from static HTML and ships no readable bundle.",
    );
  }

  return { canonicalUrl: canonical, domain: origin.hostname, documents, notes };
}

async function fetchPage(url: string, fetchImpl: Fetcher, robots: string, notes: string[]) {
  let path = "/";
  try {
    path = new URL(url).pathname || "/";
  } catch {
    return null;
  }
  if (!robotsAllows(robots, path)) {
    notes.push(`Skipped ${url} because robots.txt disallows it.`);
    return {
      finalUrl: url,
      document: pageDocument({ url, statusCode: 0, html: "", renderedWith: "http", error: "Blocked by robots.txt" }),
    };
  }
  try {
    const response = await fetchImpl(url, { timeoutMs: 12_000, maxBytes: 1_500_000 });
    const type = response.contentType.toLowerCase();
    if (type && !/html|xml|text|json|javascript/.test(type)) {
      notes.push(`Skipped non-text response at ${response.url}.`);
      return null;
    }
    return {
      finalUrl: response.url,
      document: pageDocument({
        url: response.url,
        statusCode: response.status,
        html: decodeBody(response.body),
        renderedWith: "http",
        error: response.status >= 400 ? `HTTP ${response.status}` : undefined,
      }),
    };
  } catch (error) {
    notes.push(`Fetch failed for ${url}: ${error instanceof Error ? error.message : "unknown error"}`);
    return {
      finalUrl: url,
      document: pageDocument({
        url,
        statusCode: 0,
        html: "",
        renderedWith: "http",
        error: error instanceof Error ? error.message : "Fetch failed",
      }),
    };
  }
}

function needsScript(html: string) {
  const text = visibleText(html);
  return text.length < 400 && /<script[^>]+src=/i.test(html);
}

function visibleText(html: string) {
  const $ = load(html);
  $("script,style,noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

function scriptUrls(html: string, base: string) {
  const $ = load(html);
  const urls: string[] = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    try {
      const url = new URL(src, base);
      if (url.hostname === new URL(base).hostname) urls.push(url.toString());
    } catch {
      /* ignore bad script src */
    }
  });
  return urls;
}

function discoverLinks(html: string, base: string, script: string) {
  const found = new Set<string>();
  const $ = load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = sameOriginHttp(href, base);
    if (abs) found.add(abs);
  });
  for (const match of script.matchAll(
    /["'`](\/(?:token|tokenomics|community|about|roadmap|faq|docs|whitepaper|litepaper)(?:\/[a-z0-9\-_/]*)?)["'`]/gi,
  )) {
    const abs = sameOriginHttp(match[1], base);
    if (abs) found.add(abs);
  }
  return [...found];
}

function sameOriginHttp(href: string, base: string) {
  try {
    const url = new URL(href, base);
    const root = new URL(base);
    if (!sameSite(url, root)) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (imageRole(url.pathname) !== "other" && /\.(png|jpe?g|gif|webp|svg|ico|css|js|zip)$/i.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function scorePath(url: string) {
  const path = url.toLowerCase();
  return KEYWORDS.reduce((score, keyword) => score + (path.includes(keyword) ? 2 : 0), 0);
}

function canonicalFrom(doc: ResearchDocument) {
  if (!doc.html) return null;
  const $ = load(doc.html);
  const href = $('link[rel="canonical"]').attr("href");
  if (!href) return null;
  try {
    return new URL(href, doc.url).toString();
  } catch {
    return null;
  }
}

export async function tryPlaywright(url: string) {
  if (process.env.PLAYWRIGHT_ENABLED !== "1") return null;
  const specifier = "playwright";
  try {
    const loaded = (await import(/* webpackIgnore: true */ specifier)) as {
      chromium?: {
        launch: (opts: { headless: boolean }) => Promise<{
          newContext: () => Promise<{
            newPage: () => Promise<{
              goto: (target: string, opts: { timeout: number; waitUntil: string }) => Promise<void>;
              content: () => Promise<string>;
              innerText: (sel: string) => Promise<string>;
              close: () => Promise<void>;
            }>;
            close: () => Promise<void>;
          }>;
          close: () => Promise<void>;
        }>;
      };
    };
    const browser = await loaded.chromium?.launch({ headless: true });
    if (!browser) return null;
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url, { timeout: 20_000, waitUntil: "domcontentloaded" });
      const html = await page.content();
      const text = await page.innerText("body").catch(() => "");
      await context.close();
      return { html, text };
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}
