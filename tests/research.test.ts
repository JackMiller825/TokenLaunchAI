import { describe, expect, it } from "vitest";
import { extractResearch, findConfigWindow } from "../src/lib/research/extract";
import { safeFetch } from "../src/lib/research/safe-fetch";
import { robotsAllows } from "../src/lib/research/robots";
import { isBlockedIp, resolvePublicAddresses } from "../src/lib/research/ssrf";
import type { ResearchDocument } from "../src/lib/research/types";

const bundle = `
var k={name:\`MedalNerd\`,ticker:\`$NERD\`,intendedNetwork:\`Ethereum mainnet\`,chainId:1,deploymentConfirmed:!1,launchStatus:null,contractAddress:null,contractVerified:!1,totalSupply:\`1,000,000,000\`,buySellTax:\`0%\`,liquidityStatus:\`Burn\`,ownershipStatus:\`Renounce\`,tokenomics:null,evidence:{totalSupply:null,buySellTax:null,liquidityStatus:null,ownershipStatus:null},links:{x:\`https://x.com/medalnerd\`,telegram:\`https://t.me/medalnerd\`,swap:null,website:\`https://medal.example\`},verifiedLinks:{x:!0,telegram:!0,swap:!1}};
var decoy="0x1111111111111111111111111111111111111111";
var story=\`Meet MedalNerd, an independent Ethereum meme project. The character is fictional and not an endorsement.\`;
`;

describe("ssrf", () => {
  it("blocks private, loopback, and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.1.1", "192.168.0.5", "172.16.0.4", "169.254.169.254", "0.0.0.0", "::1"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
    expect(isBlockedIp("1.1.1.1")).toBe(false);
  });

  it("rejects a host that resolves to a private address", async () => {
    await expect(resolvePublicAddresses("rebinder.example", async () => ["127.0.0.1"])).rejects.toThrow(/blocked/i);
  });

  it("rejects decimal and localhost names", async () => {
    await expect(resolvePublicAddresses("127.0.0.1")).rejects.toThrow(/blocked/i);
    await expect(resolvePublicAddresses("localhost")).rejects.toThrow(/blocked/i);
    await expect(resolvePublicAddresses("2130706433")).rejects.toThrow(/blocked/i);
  });
});

describe("robots and redirects", () => {
  it("honors the longest matching rule", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/ok\n";
    expect(robotsAllows(robots, "/private/secret")).toBe(false);
    expect(robotsAllows(robots, "/private/ok")).toBe(true);
    expect(robotsAllows(robots, "/token")).toBe(true);
  });

  it("refuses a loopback URL before connecting", async () => {
    await expect(safeFetch("http://127.0.0.1/secret", { timeoutMs: 500 })).rejects.toThrow(/blocked/i);
    await expect(safeFetch("http://169.254.169.254/latest", { timeoutMs: 500 })).rejects.toThrow(/blocked/i);
  });

  it("times out when the pinned public address does not answer", async () => {
    await expect(safeFetch("http://example.com:9/", { timeoutMs: 400, resolve: async () => ["1.1.1.1"] })).rejects.toThrow();
  });
});

describe("extraction", () => {
  it("reads a static token page without inventing a contract", () => {
    const doc: ResearchDocument = {
      url: "https://medal.example/",
      statusCode: 200,
      renderedWith: "http",
      html: `<html><head><title>MedalNerd ($NERD) — Big medal. Bigger nerd.</title><meta name="description" content="An independent Ethereum meme project."></head><body><h1>MedalNerd</h1><p>The contract address is not published yet. Total supply 1,000,000,000.</p><a href="/token">Tokenomics</a></body></html>`,
    };
    const pack = extractResearch([doc], doc.url);
    expect(pack.facts.find((fact) => fact.fieldKey === "identity.name")?.value).toBe("MedalNerd");
    expect(pack.facts.find((fact) => fact.fieldKey === "identity.ticker")?.value).toBe("NERD");
    expect(pack.facts.find((fact) => fact.fieldKey === "token.contract")?.status).toBe("MISSING");
    expect(pack.routes).toContain("/token");
  });

  it("reads a client bundle and keeps unverified tokenomics unverified", () => {
    expect(findConfigWindow(bundle)).toBeTruthy();
    const pack = extractResearch(
      [
        {
          url: "https://medal.example/",
          statusCode: 200,
          renderedWith: "script",
          html: `<html><head><title>MedalNerd ($NERD) — Big medal. Bigger nerd.</title><meta name="description" content="Meet MedalNerd, an independent Ethereum meme project."></head><body><div id="root"></div></body></html>`,
          scriptText: bundle,
        },
      ],
      "https://medal.example/",
    );
    const contract = pack.facts.find((fact) => fact.fieldKey === "token.contract");
    const supply = pack.facts.find((fact) => fact.fieldKey === "token.totalSupply");
    const liquidity = pack.facts.find((fact) => fact.fieldKey === "token.liquidityStatus");
    expect(contract?.value).toBeNull();
    expect(contract?.status).toBe("MISSING");
    expect(JSON.stringify(pack.facts)).not.toContain("0x1111111111111111111111111111111111111111");
    expect(supply?.value).toContain("1,000,000,000");
    expect(supply?.status).toBe("REPORTED_UNVERIFIED");
    expect(liquidity?.status).not.toBe("VERIFIED");
    expect(pack.facts.find((fact) => fact.fieldKey === "social.telegram")?.value).toContain("t.me/medalnerd");
    expect(pack.facts.find((fact) => fact.fieldKey === "identity.disclaimer")?.value?.toLowerCase()).toContain("fictional");
  });

  it("keeps the homepage description when inner pages differ", () => {
    const home: ResearchDocument = {
      url: "https://medal.example/",
      statusCode: 200,
      renderedWith: "http",
      html: `<html><head><title>MedalNerd ($NERD) — Big medal.</title><link rel="canonical" href="https://medal.example/"/><meta name="description" content="An independent Ethereum meme project."></head><body><p>Total supply 100.</p></body></html>`,
    };
    const token: ResearchDocument = {
      url: "https://medal.example/token",
      statusCode: 200,
      renderedWith: "http",
      html: `<html><head><link rel="canonical" href="https://medal.example/token"/><meta name="description" content="Token page details for supply and tax."></head><body><p>Total supply 100.</p></body></html>`,
    };
    const pack = extractResearch([home, token], "https://medal.example/");
    const description = pack.facts.find((fact) => fact.fieldKey === "identity.description");
    const website = pack.facts.find((fact) => fact.fieldKey === "identity.website");
    expect(description?.value).toBe("An independent Ethereum meme project.");
    expect(description?.status).not.toBe("CONFLICTING");
    expect(website?.status).not.toBe("CONFLICTING");
    expect(website?.value).toBe("https://medal.example/");
  });

  it("marks conflicting supply and collapses duplicate names", () => {
    const first: ResearchDocument = {
      url: "https://medal.example/a",
      statusCode: 200,
      renderedWith: "http",
      html: "<html><head><title>MedalNerd ($NERD) — Hi</title></head><body><p>Total supply 100.</p></body></html>",
    };
    const second: ResearchDocument = {
      url: "https://medal.example/b",
      statusCode: 200,
      renderedWith: "http",
      html: "<html><body><p>Total supply 900.</p><p>Total supply 900.</p></body></html>",
    };
    const pack = extractResearch([first, second], "https://medal.example/");
    const supply = pack.facts.find((fact) => fact.fieldKey === "token.totalSupply");
    expect(supply?.status).toBe("CONFLICTING");
    const names = pack.facts.filter((fact) => fact.fieldKey === "identity.name");
    expect(names).toHaveLength(1);
  });
});
