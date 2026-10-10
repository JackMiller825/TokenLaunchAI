import { lookup } from "dns/promises";
import { isIP } from "net";

export class ResearchError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata.internal"]);

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (isIP(mapped) === 4) return isBlockedIpv4(mapped);
  if (isIP(normalized) === 6) return isBlockedIpv6(normalized);
  return true;
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    return Number(part);
  });
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function isBlockedIpv4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && p[2] === 2) return true;
  if (a === 198 && b === 51 && p[2] === 100) return true;
  if (a === 203 && b === 0 && p[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("2001:db8:")) return true;
  return false;
}

export function suspiciousHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return "empty host";
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "local or metadata host";
  }
  if (host.includes("%")) return "zone identifier";
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return "encoded IP";
  if (/^0\d+\./.test(host)) return "octal IP";
  return null;
}

export type ResolveFn = (hostname: string) => Promise<string[]>;

export async function resolvePublicAddresses(hostname: string, resolve?: ResolveFn): Promise<string[]> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const suspicion = suspiciousHostname(host);
  if (suspicion) throw new ResearchError(`Blocked destination (${suspicion}).`, "ssrf");
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new ResearchError("Blocked IP destination.", "ssrf");
    return [host];
  }
  const addresses = resolve ? await resolve(host) : (await lookup(host, { all: true, verbatim: true })).map((row) => row.address);
  if (!addresses.length) throw new ResearchError("The host did not resolve.", "dns");
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new ResearchError("The host resolves to a blocked network address.", "ssrf");
    }
  }
  return addresses;
}

export function normalizeHttpUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new ResearchError("Enter a website URL.", "bad_url");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ResearchError("That URL could not be parsed.", "bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ResearchError("Only public http and https URLs are allowed.", "bad_url");
  }
  if (url.username || url.password) {
    throw new ResearchError("URLs that contain credentials are blocked.", "bad_url");
  }
  url.hash = "";
  return url;
}

export function sameSite(a: URL, b: URL) {
  return a.hostname.toLowerCase() === b.hostname.toLowerCase();
}
