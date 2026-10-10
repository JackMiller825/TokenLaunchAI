import http from "http";
import https from "https";
import { isIP } from "net";
import { ResearchError, normalizeHttpUrl, resolvePublicAddresses, type ResolveFn } from "./ssrf";

export const RESEARCH_UA = "TokenLaunchAIResearch/1.0 (+local research crawler; public pages only)";

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

export type SafeResponse = {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  contentType: string;
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  resolve?: ResolveFn;
  accept?: string;
  method?: "GET" | "HEAD";
};

function headerValue(headers: http.IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function requestOnce(target: URL, pinnedIp: string, options: SafeFetchOptions): Promise<SafeResponse> {
  const lib = target.protocol === "https:" ? https : http;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const family = isIP(pinnedIp) === 6 ? 6 : 4;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        host: pinnedIp,
        servername: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        method: options.method ?? "GET",
        path: `${target.pathname}${target.search}`,
        headers: {
          Host: target.host,
          "User-Agent": RESEARCH_UA,
          Accept: options.accept ?? "text/html,application/xhtml+xml,application/json,text/plain,application/javascript,*/*;q=0.5",
          "Accept-Language": "en",
        },
        timeout: timeoutMs,
        family,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new ResearchError("The response exceeded the size limit.", "too_large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            url: target.toString(),
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            contentType: headerValue(res.headers, "content-type"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new ResearchError("The request timed out.", "timeout"));
    });
    req.on("error", (error) => {
      reject(new ResearchError(error.message || "Request failed.", "network"));
    });
    req.end();
  });
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  let current = normalizeHttpUrl(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const addresses = await resolvePublicAddresses(current.hostname, options.resolve);
    let lastError: Error | null = null;
    let response: SafeResponse | null = null;
    for (const address of addresses) {
      try {
        response = await requestOnce(current, address, options);
        break;
      } catch (error) {
        lastError = error as Error;
      }
    }
    if (!response) throw lastError ?? new ResearchError("Request failed.", "network");
    const location = headerValue(response.headers, "location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      if (hop === MAX_REDIRECTS) throw new ResearchError("Too many redirects.", "redirects");
      current = new URL(location, current);
      if (current.username || current.password) {
        throw new ResearchError("Redirected to a URL with credentials.", "ssrf");
      }
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new ResearchError("Redirected to a non-http URL.", "ssrf");
      }
      continue;
    }
    return { ...response, url: current.toString() };
  }
  throw new ResearchError("Too many redirects.", "redirects");
}

export function decodeBody(body: Buffer) {
  return body.toString("utf8");
}
