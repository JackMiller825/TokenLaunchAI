import { crawlSite } from "../src/lib/research/crawl";
import { extractResearch } from "../src/lib/research/extract";

async function main() {
  const url = process.argv[2] || "https://elonerd.site/";
  const crawled = await crawlSite(url);
  const pack = extractResearch(
    crawled.documents.filter((doc) => doc.statusCode < 400),
    crawled.canonicalUrl,
  );
  const interesting = [
    "identity.name",
    "identity.ticker",
    "identity.tagline",
    "identity.blockchain",
    "identity.disclaimer",
    "identity.reference",
    "identity.theme",
    "token.contract",
    "token.totalSupply",
    "token.buyTax",
    "token.liquidityStatus",
    "token.ownershipStatus",
    "token.launchStatus",
    "social.telegram",
    "social.x",
  ];
  console.log(
    JSON.stringify(
      {
        canonicalUrl: crawled.canonicalUrl,
        notes: crawled.notes,
        pages: crawled.documents.map((doc) => ({
          url: doc.url,
          status: doc.statusCode,
          renderedWith: doc.renderedWith,
          error: doc.error,
        })),
        facts: pack.facts
          .filter((fact) => interesting.includes(fact.fieldKey))
          .map((fact) => ({ field: fact.fieldKey, value: fact.value, status: fact.status, notes: fact.conflictNotes })),
        assets: pack.assets.slice(0, 8).map((asset) => asset.url),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
