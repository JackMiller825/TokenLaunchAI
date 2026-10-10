import { load } from "cheerio";
import { imageRole } from "./images";
import type { AssetCandidate, DraftFact, Evidence, FactStatusName, ResearchDocument, ResearchPack } from "./types";

const LABELS: Record<string, string> = {
  "identity.name": "Token name",
  "identity.ticker": "Ticker",
  "identity.tagline": "Tagline",
  "identity.description": "Short description",
  "identity.category": "Project category",
  "identity.blockchain": "Blockchain",
  "identity.chainId": "Chain id",
  "identity.website": "Website",
  "identity.logo": "Logo",
  "identity.mascot": "Mascot",
  "identity.narrative": "Main narrative",
  "identity.theme": "Meme or cultural theme",
  "identity.disclaimer": "Project disclaimer",
  "identity.reference": "Public-figure reference",
  "token.contract": "Contract address",
  "token.standard": "Token standard",
  "token.totalSupply": "Total supply",
  "token.circulatingSupply": "Circulating supply",
  "token.decimals": "Decimals",
  "token.buyTax": "Buy tax",
  "token.sellTax": "Sell tax",
  "token.teamAllocation": "Team allocation",
  "token.communityAllocation": "Community allocation",
  "token.liquidityAllocation": "Liquidity allocation",
  "token.treasuryAllocation": "Treasury allocation",
  "token.liquidityStatus": "Liquidity status",
  "token.ownershipStatus": "Ownership status",
  "token.launchStatus": "Launch status",
  "token.launchAt": "Launch time",
  "social.telegram": "Telegram",
  "social.x": "X",
  "social.discord": "Discord",
  "trading.uniswap": "Uniswap URL",
  "trading.dextools": "DEXTools URL",
  "trading.dexscreener": "DEX Screener URL",
  "trading.etherscan": "Etherscan URL",
  "trading.pair": "Pair address",
  "brand.colors": "Brand colors",
  "brand.fonts": "Font families",
  "security.promptInjection": "Prompt-injection pattern",
};

const INJECTION =
  /ignore (all|any|previous|prior) instructions|disregard (the |all )?(above|prior)|you are now|system prompt|act as an? (admin|developer)/i;
const ADDRESS = /\b0x[a-fA-F0-9]{40}\b/;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i;

type Seed = {
  fieldKey: string;
  value: string | null;
  status: FactStatusName;
  confidence: number;
  sourceUrl: string;
  sourceType: string;
  excerpt: string | null;
  conflictNotes?: string | null;
};

export function extractResearch(documents: ResearchDocument[], canonicalUrl: string): ResearchPack {
  const seeds: Seed[] = [];
  const assets: AssetCandidate[] = [];
  const prose: string[] = [];
  const routes = new Set<string>();
  let promptInjection = false;
  const domain = safeDomain(canonicalUrl);

  seeds.push({
    fieldKey: "identity.website",
    value: canonicalUrl,
    status: "VERIFIED",
    confidence: 0.98,
    sourceUrl: canonicalUrl,
    sourceType: "fetch",
    excerpt: "Final public URL after redirects.",
  });

  for (const doc of documents) {
    if (!doc.html && !doc.scriptText) continue;
    const htmlFacts = doc.html ? extractHtml(doc) : { seeds: [], prose: [], assets: [], routes: [], injection: false };
    seeds.push(...htmlFacts.seeds);
    prose.push(...htmlFacts.prose);
    assets.push(...htmlFacts.assets);
    htmlFacts.routes.forEach((route) => routes.add(route));
    if (htmlFacts.injection) promptInjection = true;
    if (doc.scriptText) {
      const scriptFacts = extractScript(doc.scriptText, doc.url);
      seeds.push(...scriptFacts.seeds);
      prose.push(...scriptFacts.prose);
      assets.push(...scriptFacts.assets);
      scriptFacts.routes.forEach((route) => routes.add(route));
      if (scriptFacts.injection) promptInjection = true;
    }
  }

  if (promptInjection) {
    seeds.push({
      fieldKey: "security.promptInjection",
      value: "Instruction-like text was found in page content and ignored as an instruction.",
      status: "NEEDS_CONFIRMATION",
      confidence: 0.9,
      sourceUrl: canonicalUrl,
      sourceType: "security_scan",
      excerpt: "Matched a prompt-injection pattern. The text was kept as data only.",
    });
  }

  const facts = mergeSeeds(seeds);
  ensureMissing(facts, [
    "identity.name",
    "identity.ticker",
    "identity.blockchain",
    "token.contract",
    "token.totalSupply",
    "token.buyTax",
    "token.sellTax",
    "token.liquidityStatus",
    "token.ownershipStatus",
    "token.launchAt",
    "social.telegram",
    "social.x",
  ]);
  applyClaimGuards(facts);
  return {
    canonicalUrl,
    domain,
    facts,
    assets: dedupeAssets(assets).slice(0, 36),
    prose: unique(prose).slice(0, 40),
    routes: [...routes],
    promptInjection,
  };
}

function extractHtml(doc: ResearchDocument) {
  const $ = load(doc.html);
  const seeds: Seed[] = [];
  const assets: AssetCandidate[] = [];
  const routes: string[] = [];
  const title = clean($("title").first().text());
  const description = clean($('meta[name="description"]').attr("content") || "");
  const ogTitle = clean($('meta[property="og:title"]').attr("content") || "");
  const ogDescription = clean($('meta[property="og:description"]').attr("content") || "");
  const ogImage = abs(doc.url, $('meta[property="og:image"]').attr("content") || "");
  const canonicalHref = $('link[rel="canonical"]').attr("href") || "";
  const canonical = canonicalHref ? abs(doc.url, canonicalHref) : "";
  const heading = clean($("h1").first().text());
  $("script,style,noscript").remove();
  const text = clean($("body").text());
  const prose = sentences(text).slice(0, 25);
  const injection = INJECTION.test(`${title}\n${description}\n${text}`);

  const titleSource = ogTitle || title;
  const parsed = parseTitle(titleSource);
  if (parsed.name) add(seeds, "identity.name", parsed.name, "REPORTED_UNVERIFIED", 0.72, doc.url, "html_meta", titleSource);
  if (parsed.ticker) add(seeds, "identity.ticker", parsed.ticker, "REPORTED_UNVERIFIED", 0.74, doc.url, "html_meta", titleSource);
  if (parsed.tagline) add(seeds, "identity.tagline", parsed.tagline, "REPORTED_UNVERIFIED", 0.7, doc.url, "html_meta", titleSource);
  if (!parsed.name && heading && heading.length < 80) {
    add(seeds, "identity.name", heading, "REPORTED_UNVERIFIED", 0.55, doc.url, "html_heading", heading);
  }
  const desc = description || ogDescription;
  if (desc) add(seeds, "identity.description", desc, "REPORTED_UNVERIFIED", 0.7, doc.url, "html_meta", desc);
  if (ogImage) assets.push({ url: ogImage, role: imageRole(ogImage), usage: "Open Graph image", sourceUrl: doc.url });

  const jsonLd = $("script[type='application/ld+json']")
    .map((_, el) => $(el).text())
    .get();
  for (const block of jsonLd) {
    try {
      const data = JSON.parse(block) as Record<string, unknown>;
      const name = typeof data.name === "string" ? data.name : null;
      if (name) add(seeds, "identity.name", name, "REPORTED_UNVERIFIED", 0.66, doc.url, "json_ld", name);
    } catch {
      /* invalid json-ld is ignored */
    }
  }

  const combined = `${title}\n${desc}\n${text}`;
  harvestPlainClaims(combined, doc.url, "html_text", seeds);
  harvestLinks(combined, doc.url, "html_text", seeds);
  $("a[href]").each((_, el) => {
    const href = abs(doc.url, $(el).attr("href") || "");
    if (!href) return;
    harvestLinks(href, doc.url, "html_link", seeds);
    const route = routeOf(doc.url, href);
    if (route) routes.push(route);
  });
  collectImages($, doc.url, assets);
  const colors = topColors(`${doc.html}`);
  if (colors.length) add(seeds, "brand.colors", colors.join(", "), "REPORTED_UNVERIFIED", 0.4, doc.url, "css", colors.join(", "));
  const fonts = fontFamilies(doc.html);
  if (fonts.length) add(seeds, "brand.fonts", fonts.join(", "), "REPORTED_UNVERIFIED", 0.4, doc.url, "css", fonts.join(", "));
  if (canonical && isSiteRoot(canonical)) add(seeds, "identity.website", canonical, "VERIFIED", 0.9, doc.url, "canonical", canonical);
  return { seeds, prose, assets, routes, injection };
}

function extractScript(script: string, pageUrl: string) {
  const seeds: Seed[] = [];
  const assets: AssetCandidate[] = [];
  const routes: string[] = [];
  const injection = INJECTION.test(script);
  const window = findConfigWindow(script);
  if (window) {
    const evidence = sliceObject(window, "evidence");
    const links = sliceObject(window, "links");
    const verified = sliceObject(window, "verifiedLinks");
    let main = window;
    for (const block of [evidence, links, verified]) {
      if (block) main = main.replace(block, "");
    }
    const values = assignments(main);
    const evidenceValues = evidence ? assignments(evidence) : {};
    const linkValues = links ? assignments(links) : {};
    const verifiedValues = verified ? assignments(verified) : {};
    const unsupported = (key: string) => evidenceValues[key] == null || evidenceValues[key] === "null";

    if (values.name && values.name !== "null") {
      add(seeds, "identity.name", cleanTick(values.name), "REPORTED_UNVERIFIED", 0.84, pageUrl, "script_config", `name:${values.name}`);
    }
    if (values.ticker && values.ticker !== "null") {
      add(
        seeds,
        "identity.ticker",
        cleanTick(values.ticker).replace(/^\$/, ""),
        "REPORTED_UNVERIFIED",
        0.86,
        pageUrl,
        "script_config",
        `ticker:${values.ticker}`,
      );
    }
    if (values.intendedNetwork && values.intendedNetwork !== "null") {
      add(
        seeds,
        "identity.blockchain",
        cleanTick(values.intendedNetwork),
        "REPORTED_UNVERIFIED",
        0.7,
        pageUrl,
        "script_config",
        `intendedNetwork:${values.intendedNetwork}`,
        "Stated by the website. Not treated as on-chain proof.",
      );
    }
    if (values.chainId && values.chainId !== "null") {
      add(seeds, "identity.chainId", values.chainId, "REPORTED_UNVERIFIED", 0.6, pageUrl, "script_config", `chainId:${values.chainId}`);
    }
    const contract = values.contractAddress;
    if (!contract || contract === "null") {
      add(
        seeds,
        "token.contract",
        null,
        "MISSING",
        0.8,
        pageUrl,
        "script_config",
        "contractAddress is null or unpublished in the site config.",
      );
    } else if (ADDRESS.test(contract)) {
      add(
        seeds,
        "token.contract",
        contract.match(ADDRESS)?.[0] ?? contract,
        "NEEDS_CONFIRMATION",
        0.55,
        pageUrl,
        "script_config",
        `contractAddress:${contract}`,
        "Address format only. Not checked on-chain yet.",
      );
    }
    if (values.totalSupply && values.totalSupply !== "null") {
      add(
        seeds,
        "token.totalSupply",
        cleanTick(values.totalSupply),
        unsupported("totalSupply") ? "REPORTED_UNVERIFIED" : "REPORTED_UNVERIFIED",
        unsupported("totalSupply") ? 0.45 : 0.6,
        pageUrl,
        "script_config",
        `totalSupply:${values.totalSupply}`,
        unsupported("totalSupply") ? "The site shows a supply figure, but its own evidence field for supply is empty." : null,
      );
    }
    if (values.buySellTax && values.buySellTax !== "null") {
      const tax = cleanTick(values.buySellTax);
      add(
        seeds,
        "token.buyTax",
        tax,
        "REPORTED_UNVERIFIED",
        unsupported("buySellTax") ? 0.4 : 0.55,
        pageUrl,
        "script_config",
        `buySellTax:${values.buySellTax}`,
        unsupported("buySellTax") ? "Shown on the site without a cited transaction or contract read." : null,
      );
      add(
        seeds,
        "token.sellTax",
        tax,
        "REPORTED_UNVERIFIED",
        unsupported("buySellTax") ? 0.4 : 0.55,
        pageUrl,
        "script_config",
        `buySellTax:${values.buySellTax}`,
        "The site presents one buy/sell tax figure.",
      );
    }
    if (values.liquidityStatus && values.liquidityStatus !== "null") {
      add(
        seeds,
        "token.liquidityStatus",
        cleanTick(values.liquidityStatus),
        "REPORTED_UNVERIFIED",
        0.35,
        pageUrl,
        "script_config",
        `liquidityStatus:${values.liquidityStatus}`,
        "A website claim that liquidity is burned or locked is not treated as verified. The LP token was not checked.",
      );
    }
    if (values.ownershipStatus && values.ownershipStatus !== "null") {
      add(
        seeds,
        "token.ownershipStatus",
        cleanTick(values.ownershipStatus),
        "REPORTED_UNVERIFIED",
        0.35,
        pageUrl,
        "script_config",
        `ownershipStatus:${values.ownershipStatus}`,
        "Ownership was not read from the contract.",
      );
    }
    if (values.deploymentConfirmed === "!1" || values.deploymentConfirmed === "false") {
      add(
        seeds,
        "token.launchStatus",
        "Deployment not confirmed by the website",
        "REPORTED_UNVERIFIED",
        0.8,
        pageUrl,
        "script_config",
        "deploymentConfirmed:false",
      );
    } else if (values.deploymentConfirmed === "!0" || values.deploymentConfirmed === "true") {
      add(
        seeds,
        "token.launchStatus",
        "Website says deployment is confirmed",
        "NEEDS_CONFIRMATION",
        0.45,
        pageUrl,
        "script_config",
        "deploymentConfirmed:true",
        "Still requires an independent contract read.",
      );
    }
    if (values.launchStatus && values.launchStatus !== "null") {
      add(
        seeds,
        "token.launchStatus",
        cleanTick(values.launchStatus),
        "REPORTED_UNVERIFIED",
        0.5,
        pageUrl,
        "script_config",
        `launchStatus:${values.launchStatus}`,
      );
    }
    mapLink("x", "social.x", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("twitter", "social.x", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("telegram", "social.telegram", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("discord", "social.discord", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("swap", "trading.uniswap", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("chart", "trading.dexscreener", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("explorer", "trading.etherscan", linkValues, verifiedValues, pageUrl, seeds);
    mapLink("website", "identity.website", linkValues, verifiedValues, pageUrl, seeds);
  }

  const prose = scriptProse(script);
  harvestLinks(`${prose.join("\n")}\n${window ?? ""}`, pageUrl, "script_url", seeds);
  for (const match of script.matchAll(
    /(?:^|[^A-Za-z0-9])(\/(?:token|tokenomics|community|about|roadmap|faq|docs|whitepaper|litepaper)(?:\/[a-z0-9\-]+)?)/gi,
  )) {
    routes.push(match[1]);
  }
  for (const match of script.matchAll(/assets\/[A-Za-z0-9_./\-]+\.(?:png|jpe?g|gif|webp|svg)/g)) {
    const url = abs(pageUrl, match[0]);
    if (url) assets.push({ url, role: imageRole(url), usage: "Referenced by the site bundle", sourceUrl: pageUrl });
  }
  harvestPlainClaims(prose.join("\n"), pageUrl, "script_prose", seeds);
  return { seeds, prose, assets, routes, injection };
}

function mapLink(
  key: string,
  fieldKey: string,
  links: Record<string, string>,
  verified: Record<string, string>,
  pageUrl: string,
  seeds: Seed[],
) {
  const raw = links[key];
  if (!raw || raw === "null") return;
  const value = cleanTick(raw);
  if (!/^https?:\/\//i.test(value)) return;
  const flag = verified[key];
  const explicitlyUnverified = flag === "!1" || flag === "false";
  const explicitlyVerified = flag === "!0" || flag === "true";
  add(
    seeds,
    fieldKey,
    value,
    explicitlyUnverified ? "NEEDS_CONFIRMATION" : "NEEDS_CONFIRMATION",
    explicitlyVerified ? 0.62 : 0.4,
    pageUrl,
    "script_config",
    `${key}:${value}`,
    explicitlyVerified
      ? "The site marks this link verified in its own config. Confirm it is the official destination before using it in ads."
      : "The site does not mark this link as verified.",
  );
}

function harvestPlainClaims(text: string, url: string, sourceType: string, seeds: Seed[]) {
  if (!text) return;
  const ticker = text.match(/\$([A-Z][A-Z0-9]{1,14})\b/);
  if (ticker) add(seeds, "identity.ticker", ticker[1], "REPORTED_UNVERIFIED", 0.6, url, sourceType, ticker[0]);
  const contractLine = text.match(/contract(?: address)?[^A-Za-z0-9]{0,20}(0x[a-fA-F0-9]{40})/i);
  if (contractLine) {
    add(
      seeds,
      "token.contract",
      contractLine[1],
      "NEEDS_CONFIRMATION",
      0.5,
      url,
      sourceType,
      clipExcerpt(contractLine[0]),
      "Found next to a contract label. Not checked on-chain yet.",
    );
  }
  if (/coming soon|not published|not yet (published|supplied)|address is not published/i.test(text) && /contract/i.test(text)) {
    add(seeds, "token.contract", null, "MISSING", 0.75, url, sourceType, "The page says the contract address is not published.");
  }
  const supply = text.match(/total supply[^0-9]{0,20}([0-9][0-9,.\s]{2,20}(?:\s*[kmb])?)/i);
  if (supply) add(seeds, "token.totalSupply", supply[1].trim(), "REPORTED_UNVERIFIED", 0.5, url, sourceType, clipExcerpt(supply[0]));
  const buy = text.match(/buy tax[^0-9%]{0,12}([0-9]+(?:\.[0-9]+)?%)/i);
  if (buy) add(seeds, "token.buyTax", buy[1], "REPORTED_UNVERIFIED", 0.45, url, sourceType, clipExcerpt(buy[0]), "Website text only.");
  const sell = text.match(/sell tax[^0-9%]{0,12}([0-9]+(?:\.[0-9]+)?%)/i);
  if (sell) add(seeds, "token.sellTax", sell[1], "REPORTED_UNVERIFIED", 0.45, url, sourceType, clipExcerpt(sell[0]), "Website text only.");
  const team = text.match(/team(?: allocation)?[^0-9%]{0,16}([0-9]+(?:\.[0-9]+)?%)/i);
  if (team) add(seeds, "token.teamAllocation", team[1], "REPORTED_UNVERIFIED", 0.4, url, sourceType, clipExcerpt(team[0]));
  const community = text.match(/community(?: allocation)?[^0-9%]{0,16}([0-9]+(?:\.[0-9]+)?%)/i);
  if (community)
    add(seeds, "token.communityAllocation", community[1], "REPORTED_UNVERIFIED", 0.4, url, sourceType, clipExcerpt(community[0]));
  const liquidity = text.match(/liquidity(?: allocation)?[^0-9%]{0,16}([0-9]+(?:\.[0-9]+)?%)/i);
  if (liquidity)
    add(seeds, "token.liquidityAllocation", liquidity[1], "REPORTED_UNVERIFIED", 0.4, url, sourceType, clipExcerpt(liquidity[0]));
  const treasury = text.match(/treasury(?: allocation)?[^0-9%]{0,16}([0-9]+(?:\.[0-9]+)?%)/i);
  if (treasury) add(seeds, "token.treasuryAllocation", treasury[1], "REPORTED_UNVERIFIED", 0.4, url, sourceType, clipExcerpt(treasury[0]));
  if (/\b(ethereum mainnet|erc-20|erc20)\b/i.test(text)) {
    add(
      seeds,
      "identity.blockchain",
      "Ethereum mainnet",
      "REPORTED_UNVERIFIED",
      0.55,
      url,
      sourceType,
      "The page mentions Ethereum.",
      "Mentioned by the project. Not treated as deployment proof.",
    );
    add(
      seeds,
      "token.standard",
      "ERC-20",
      "REPORTED_UNVERIFIED",
      0.4,
      url,
      sourceType,
      "Inferred only if the page says Ethereum or ERC-20. Confirm on-chain.",
    );
  } else if (/\bsolana\b/i.test(text)) {
    add(seeds, "identity.blockchain", "Solana", "REPORTED_UNVERIFIED", 0.55, url, sourceType, "The page mentions Solana.");
  } else if (/\bbase\b/i.test(text) && /chain|network|token/i.test(text)) {
    add(seeds, "identity.blockchain", "Base", "REPORTED_UNVERIFIED", 0.4, url, sourceType, "The page mentions Base.");
  }
  if (/\bmeme\b/i.test(text))
    add(seeds, "identity.category", "Meme token", "REPORTED_UNVERIFIED", 0.6, url, sourceType, "The page describes the project as a meme.");
  const launch = text.match(
    /(?:launch(?:es|ing)?(?: date| time)?|goes live)[^A-Za-z0-9]{0,12}([A-Z][a-z]+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?)/,
  );
  if (launch) add(seeds, "token.launchAt", launch[1], "NEEDS_CONFIRMATION", 0.45, url, sourceType, clipExcerpt(launch[0]));
  if (/lp (?:is )?burn|liquidity (?:is )?burn|burned lp|burnt lp/i.test(text)) {
    add(
      seeds,
      "token.liquidityStatus",
      "Website claims LP is burned",
      "REPORTED_UNVERIFIED",
      0.3,
      url,
      sourceType,
      "LP burn wording found.",
      "Not verified against the LP token balance.",
    );
  }
  if (/ownership (?:is )?renounc|renounced ownership/i.test(text)) {
    add(
      seeds,
      "token.ownershipStatus",
      "Website claims ownership is renounced",
      "REPORTED_UNVERIFIED",
      0.3,
      url,
      sourceType,
      "Renounce wording found.",
      "Not read from the contract owner() call.",
    );
  }
  const disclaimer = disclaimerLine(text);
  if (disclaimer) add(seeds, "identity.disclaimer", disclaimer, "REPORTED_UNVERIFIED", 0.7, url, sourceType, disclaimer);
  const reference = clauses(text).find((line) => /\belon musk\b/i.test(line) && line.split(/\s+/).length >= 6);
  if (reference) {
    add(
      seeds,
      "identity.reference",
      reference,
      "REPORTED_UNVERIFIED",
      0.66,
      url,
      sourceType,
      reference,
      "Quoted from the site. This is not an endorsement or a claim of involvement.",
    );
  }
}

function harvestLinks(text: string, pageUrl: string, sourceType: string, seeds: Seed[]) {
  const urls = text.match(/https?:\/\/[^\s"'`<>)\]]+/g) ?? [];
  for (const raw of urls) {
    const url = raw.replace(/[.,]+$/, "");
    const lower = url.toLowerCase();
    if (lower.includes("t.me/") || lower.includes("telegram.me/")) {
      add(
        seeds,
        "social.telegram",
        url,
        "NEEDS_CONFIRMATION",
        0.58,
        pageUrl,
        sourceType,
        url,
        "Confirm this is the official community before promoting it.",
      );
    } else if (lower.includes("x.com/") || lower.includes("twitter.com/")) {
      add(
        seeds,
        "social.x",
        url,
        "NEEDS_CONFIRMATION",
        0.58,
        pageUrl,
        sourceType,
        url,
        "Confirm this is the official account before promoting it.",
      );
    } else if (lower.includes("discord.gg/") || lower.includes("discord.com/invite")) {
      add(seeds, "social.discord", url, "NEEDS_CONFIRMATION", 0.5, pageUrl, sourceType, url);
    } else if (lower.includes("app.uniswap.org") || lower.includes("uniswap.org/")) {
      add(seeds, "trading.uniswap", url, "NEEDS_CONFIRMATION", 0.5, pageUrl, sourceType, url);
    } else if (lower.includes("dextools.io")) {
      add(seeds, "trading.dextools", url, "NEEDS_CONFIRMATION", 0.45, pageUrl, sourceType, url);
    } else if (lower.includes("dexscreener.com")) {
      add(seeds, "trading.dexscreener", url, "NEEDS_CONFIRMATION", 0.45, pageUrl, sourceType, url);
    } else if (lower.includes("etherscan.io")) {
      add(seeds, "trading.etherscan", url, "NEEDS_CONFIRMATION", 0.5, pageUrl, sourceType, url);
      const address = url.match(ADDRESS);
      if (address && /\/token\/0x|\/address\/0x/i.test(url)) {
        add(
          seeds,
          "token.contract",
          address[0],
          "NEEDS_CONFIRMATION",
          0.6,
          pageUrl,
          sourceType,
          url,
          "Taken from an explorer link. Still needs an RPC read.",
        );
      }
    }
  }
}

function applyClaimGuards(facts: DraftFact[]) {
  const contract = facts.find((fact) => fact.fieldKey === "token.contract");
  if (contract?.value && contract.status !== "VERIFIED") {
    contract.conflictNotes = [contract.conflictNotes, "Website or link evidence is not on-chain proof."].filter(Boolean).join(" ");
  }
  const lp = facts.find((fact) => fact.fieldKey === "token.liquidityStatus");
  if (lp?.value && lp.status === "VERIFIED") {
    lp.status = "REPORTED_UNVERIFIED";
    lp.conflictNotes = "Downgraded: LP burn claims are not marked verified by this research pass.";
  }
  const narrativeBits = facts.filter(
    (fact) => fact.fieldKey === "identity.description" || fact.fieldKey === "identity.tagline" || fact.fieldKey === "identity.disclaimer",
  );
  if (narrativeBits.length && !facts.some((fact) => fact.fieldKey === "identity.narrative")) {
    const value = narrativeBits
      .map((fact) => fact.value)
      .filter(Boolean)
      .join(" ");
    facts.push(
      makeFact(
        "identity.narrative",
        value || null,
        "REPORTED_UNVERIFIED",
        0.55,
        narrativeBits[0].sourceUrl,
        "derived",
        value,
        "Assembled from the site's own description and disclaimers.",
      ),
    );
  }
  const description = facts.find((fact) => fact.fieldKey === "identity.description")?.value ?? "";
  const disclaimer = facts.find((fact) => fact.fieldKey === "identity.disclaimer")?.value ?? "";
  const reference = facts.find((fact) => fact.fieldKey === "identity.reference")?.value ?? "";
  const tokenName = facts.find((fact) => fact.fieldKey === "identity.name")?.value ?? "";
  if ((description + disclaimer + reference).length > 20 && !facts.some((fact) => fact.fieldKey === "identity.theme")) {
    const theme = themeFromText(`${description} ${disclaimer} ${reference}`, tokenName);
    if (theme) {
      facts.push(
        makeFact(
          "identity.theme",
          theme,
          "REPORTED_UNVERIFIED",
          0.5,
          facts[0]?.sourceUrl ?? null,
          "derived",
          theme,
          "A thematic reading of the site's own words. Not an endorsement and not proof of audience demand.",
        ),
      );
    }
  }
}

function themeFromText(text: string, tokenName: string) {
  const stripped = tokenName ? text.replace(new RegExp(tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "") : text;
  const themes: string[] = [];
  if (/meme/i.test(stripped)) themes.push("internet meme culture");
  if (/\bnerd\b|medal|tiny victor/i.test(stripped)) themes.push("nerdy small-win humor");
  if (/\belon musk\b|\bmusk\b/i.test(stripped)) themes.push("unofficial cultural reference to a public figure, not an endorsement");
  if (/\bAI\b|robot/i.test(stripped)) themes.push("AI or robotics imagery");
  if (/ethereum/i.test(stripped)) themes.push("Ethereum community humor");
  return themes.length ? themes.join("; ") : null;
}

function mergeSeeds(seeds: Seed[]): DraftFact[] {
  const groups = new Map<string, Seed[]>();
  for (const seed of seeds) {
    const list = groups.get(seed.fieldKey) ?? [];
    list.push(seed);
    groups.set(seed.fieldKey, list);
  }
  const facts: DraftFact[] = [];
  for (const [fieldKey, group] of groups) {
    const present = group.filter((seed) => seed.value && seed.value.trim());
    const missing = group.filter((seed) => !seed.value);
    const distinct = uniqueBy(present, (seed) => compareValue(fieldKey, seed.value || ""));
    if (fieldKey === "identity.description" && distinct.length > 1) {
      const home = distinct.find((seed) => isSiteRoot(seed.sourceUrl)) || [...distinct].sort((a, b) => (a.value || "").length - (b.value || "").length)[0];
      const others = distinct.filter((seed) => seed !== home);
      facts.push({
        fieldKey,
        label: LABELS[fieldKey] ?? fieldKey,
        value: home.value,
        status: home.status,
        confidence: round(home.confidence),
        sourceUrl: home.sourceUrl,
        sourceType: home.sourceType,
        excerpt: home.excerpt,
        conflictNotes: others.length ? `Other crawled pages use different descriptions: ${others.map((seed) => seed.value).join(" | ")}` : null,
        evidence: group.map(toEvidence),
      });
      continue;
    }
    if (distinct.length > 1) {
      const evidence = group.map(toEvidence);
      facts.push({
        fieldKey,
        label: LABELS[fieldKey] ?? fieldKey,
        value: distinct.map((seed) => seed.value).join(" | "),
        status: "CONFLICTING",
        confidence: 0.25,
        sourceUrl: distinct[0].sourceUrl,
        sourceType: "conflict",
        excerpt: distinct
          .map((seed) => seed.excerpt)
          .filter(Boolean)
          .join(" \n "),
        conflictNotes: `Sources disagree: ${distinct.map((seed) => `${seed.value} (${seed.sourceType})`).join("; ")}`,
        evidence,
      });
      continue;
    }
    if (distinct.length === 1) {
      const best = [...present].sort((a, b) => b.confidence - a.confidence)[0];
      let notes = unique(present.map((seed) => seed.conflictNotes || "").filter(Boolean));
      if (best.status === "VERIFIED") notes = notes.filter((note) => !/does not mark this link as verified/i.test(note));
      if (missing.length && /not published|null/i.test(missing.map((seed) => seed.excerpt || "").join(" "))) {
        notes.push("Another source on the same site says this value is unpublished or empty.");
      }
      facts.push({
        fieldKey,
        label: LABELS[fieldKey] ?? fieldKey,
        value: best.value,
        status: missing.length && fieldKey === "token.contract" ? "CONFLICTING" : best.status,
        confidence: round(Math.min(0.95, best.confidence + Math.min(0.08, (present.length - 1) * 0.03))),
        sourceUrl: best.sourceUrl,
        sourceType: best.sourceType,
        excerpt: best.excerpt,
        conflictNotes: notes.join(" ") || null,
        evidence: group.map(toEvidence),
      });
      continue;
    }
    const note = missing[0];
    facts.push(
      makeFact(
        fieldKey,
        null,
        "MISSING",
        note?.confidence ?? 0.5,
        note?.sourceUrl ?? null,
        note?.sourceType ?? "scan",
        note?.excerpt ?? "Not found in the crawled pages.",
        note?.conflictNotes ?? null,
        missing.map(toEvidence),
      ),
    );
  }
  return facts.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

function ensureMissing(facts: DraftFact[], keys: string[]) {
  for (const key of keys) {
    if (!facts.some((fact) => fact.fieldKey === key)) {
      facts.push(makeFact(key, null, "MISSING", 0.2, null, "scan", "Not found in the crawled pages.", null, []));
    }
  }
}

function makeFact(
  fieldKey: string,
  value: string | null,
  status: FactStatusName,
  confidence: number,
  sourceUrl: string | null,
  sourceType: string | null,
  excerpt: string | null,
  conflictNotes: string | null = null,
  evidence: Evidence[] = [],
): DraftFact {
  return {
    fieldKey,
    label: LABELS[fieldKey] ?? fieldKey,
    value,
    status,
    confidence: round(confidence),
    sourceUrl,
    sourceType,
    excerpt,
    conflictNotes,
    evidence,
  };
}

function add(
  seeds: Seed[],
  fieldKey: string,
  value: string | null,
  status: FactStatusName,
  confidence: number,
  sourceUrl: string,
  sourceType: string,
  excerpt: string | null,
  conflictNotes?: string | null,
) {
  seeds.push({
    fieldKey,
    value: value?.trim() || null,
    status,
    confidence,
    sourceUrl,
    sourceType,
    excerpt: excerpt ? clipExcerpt(excerpt) : null,
    conflictNotes: conflictNotes ?? null,
  });
}

function toEvidence(seed: Seed): Evidence {
  return { sourceUrl: seed.sourceUrl, sourceType: seed.sourceType, excerpt: seed.excerpt };
}

export function findConfigWindow(source: string) {
  const anchors = ["contractAddress", "totalSupply", "buySellTax", "intendedNetwork"];
  let best = "";
  let bestScore = 0;
  for (const anchor of anchors) {
    let from = 0;
    while (from < source.length) {
      const index = source.indexOf(anchor, from);
      if (index < 0) break;
      const window = source.slice(Math.max(0, index - 500), Math.min(source.length, index + 2200));
      const score = anchors.reduce((sum, key) => sum + (window.includes(key) ? 1 : 0), 0) + (window.includes("ticker") ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = window;
      }
      from = index + anchor.length;
    }
  }
  return bestScore >= 3 ? best : null;
}

function sliceObject(source: string, key: string) {
  const marker = `${key}:{`;
  const index = source.indexOf(marker);
  if (index < 0) return null;
  const start = index + key.length + 1;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function assignments(source: string) {
  const result: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)'|(null|!0|!1|true|false|-?\d+(?:\.\d+)?))/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    if (!(key in result)) result[key] = value;
  }
  return result;
}

function scriptProse(script: string) {
  const found: string[] = [];
  const parts = script.split("`");
  const odds = parts.filter((_, index) => index % 2 === 1);
  const evens = parts.filter((_, index) => index % 2 === 0);
  const paired = proseScore(odds) >= proseScore(evens) ? odds : evens;
  for (const raw of paired) {
    const value = clean(raw);
    if (looksLikeProse(value)) found.push(value);
  }
  const quoted = /"((?:\\.|[^"\\]){40,500})"|'((?:\\.|[^'\\]){40,500})'/g;
  for (const match of script.matchAll(quoted)) {
    const value = clean((match[1] || match[2] || "").replace(/\\n/g, " ").replace(/\\(["'])/g, "$1"));
    if (looksLikeProse(value)) found.push(value);
  }
  const ranked = unique(found);
  const important = ranked.filter(isClaimBearing);
  const rest = ranked.filter((value) => !isClaimBearing(value));
  return [...important, ...rest].slice(0, 40);
}

function isClaimBearing(value: string) {
  return /fictional|endorsement|not affiliated|elon musk|white house|total supply|buy tax|sell tax|contract address|liquidity|renounc|coming soon|not published|fake endorsements/i.test(
    value,
  );
}

function proseScore(parts: string[]) {
  return parts.reduce((sum, part) => sum + (looksLikeProse(clean(part)) ? 1 : 0), 0);
}

function looksLikeProse(value: string) {
  if (value.length < 40 || value.length > 900) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  if (/function\b|=>|<\/|className|\{|\}|;\s*(?:var|const|let)\b|\b(?:null|undefined|true|false)\b/.test(value)) return false;
  const letters = (value.match(/[A-Za-z]/g) || []).length;
  if (letters / value.length < 0.45) return false;
  const punctuation = (value.match(/[=:()[\]]/g) || []).length;
  if (punctuation > 2) return false;
  return true;
}

function parseTitle(title: string) {
  const match = title.match(/^(.+?)\s*\(\$([A-Za-z0-9]{2,15})\)\s*[—–:-]\s*(.+)$/);
  if (match) return { name: clean(match[1]), ticker: match[2].toUpperCase(), tagline: clean(match[3]) };
  const ticker = title.match(/\$([A-Z][A-Z0-9]{1,14})/);
  return { name: "", ticker: ticker?.[1] ?? "", tagline: "" };
}

function collectImages($: ReturnType<typeof load>, pageUrl: string, assets: AssetCandidate[]) {
  $("img[src]").each((_, el) => {
    const url = abs(pageUrl, $(el).attr("src") || "");
    if (!url || !IMAGE.test(url)) return;
    assets.push({ url, role: imageRole(url), usage: clean($(el).attr("alt") || "Image on the page"), sourceUrl: pageUrl });
  });
}

function sentences(text: string) {
  return clauses(text).filter((part) => part.split(/\s+/).length >= 6 && part.length < 400);
}

function clauses(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => clean(part))
    .filter((part) => part.length > 0 && part.length < 400);
}

function disclaimerLine(text: string) {
  if (
    !/not affiliated|fictional|not an endorsement|does not promise|independent meme|no (?:official )?partnership|fake endorsements/i.test(
      text,
    )
  )
    return null;
  const parts = clauses(text);
  const index = parts.findIndex((line) =>
    /not affiliated|fictional|not an endorsement|does not promise|independent meme|no (?:official )?partnership|fake endorsements/i.test(
      line,
    ),
  );
  if (index < 0) return null;
  let sentence = parts[index];
  if (sentence.split(/\s+/).length < 6 && parts[index + 1]) sentence = `${sentence} ${parts[index + 1]}`;
  return sentence.split(/\s+/).length >= 4 ? sentence : null;
}

function topColors(css: string) {
  const counts = new Map<string, number>();
  for (const match of css.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const color = match[0].toLowerCase();
    if (["#fff", "#ffffff", "#000", "#000000", "#111", "#111111"].includes(color)) continue;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color]) => color);
}

function fontFamilies(css: string) {
  const fonts = new Set<string>();
  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const family = match[1].split(",")[0]?.replace(/["']/g, "").trim();
    if (family && !/inherit|initial|sans-serif|serif|monospace/i.test(family)) fonts.add(family);
  }
  return [...fonts].slice(0, 4);
}

function dedupeAssets(assets: AssetCandidate[]) {
  const seen = new Set<string>();
  const ranked = [...assets].sort((a, b) => roleRank(a.role) - roleRank(b.role));
  const result: AssetCandidate[] = [];
  for (const asset of ranked) {
    if (seen.has(asset.url)) continue;
    seen.add(asset.url);
    result.push(asset);
  }
  return result;
}

function roleRank(role: string) {
  return ["logo", "mascot", "hero", "banner", "meme", "sticker", "other"].indexOf(role) + 1 || 9;
}

function routeOf(pageUrl: string, href: string) {
  try {
    const page = new URL(pageUrl);
    const next = new URL(href);
    if (page.hostname !== next.hostname) return null;
    if (!/^\/[a-z0-9\-_/]*$/i.test(next.pathname) || next.pathname === "/") return null;
    if (IMAGE.test(next.pathname)) return null;
    return next.pathname;
  } catch {
    return null;
  }
}

function abs(base: string, value: string) {
  if (!value) return "";
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTick(value: string) {
  return clean(value).replace(/^\$/, (match, offset) => (offset ? match : match));
}

function clipExcerpt(value: string) {
  const cleanValue = clean(value);
  return cleanValue.length > 280 ? `${cleanValue.slice(0, 279)}…` : cleanValue;
}

function normalizeValue(value: string) {
  return value.trim().replace(/^\$/, "").replace(/\s+/g, " ").toLowerCase();
}

function compareValue(fieldKey: string, value: string) {
  if (fieldKey === "identity.website") {
    try {
      const url = new URL(value);
      const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
      return `${url.protocol}//${url.host}${path}`.toLowerCase();
    } catch {
      return normalizeValue(value).replace(/\/$/, "");
    }
  }
  return normalizeValue(value);
}

function isSiteRoot(value: string) {
  try {
    const url = new URL(value);
    return url.pathname === "/" || url.pathname === "";
  } catch {
    return false;
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(value);
  }
  return result;
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function labelFor(key: string) {
  return LABELS[key] ?? key;
}

export function factValue(facts: DraftFact[], key: string) {
  return facts.find((fact) => fact.fieldKey === key)?.value ?? null;
}

export function publicFacts(facts: DraftFact[]) {
  return facts.filter((fact) => fact.fieldKey !== "security.promptInjection");
}
