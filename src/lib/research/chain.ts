import type { DraftFact } from "./types";

const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  owner: "0x8da5cb5b",
};

export type ChainCheck = {
  configured: boolean;
  notes: string[];
  facts: DraftFact[];
};

type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

export async function verifyOnChain(facts: DraftFact[], rpcUrl: string | undefined, call?: Rpc): Promise<ChainCheck> {
  const contract = facts.find((fact) => fact.fieldKey === "token.contract");
  const address = contract?.value && /^0x[a-fA-F0-9]{40}$/.test(contract.value) ? contract.value : null;
  if (!address) {
    return {
      configured: Boolean(rpcUrl),
      notes: ["No contract address is available to read on-chain."],
      facts: [],
    };
  }
  if (!rpcUrl && !call) {
    return {
      configured: false,
      notes: ["ETH_RPC_URL is not configured, so the contract address was not read on-chain."],
      facts: [],
    };
  }
  const rpc: Rpc = call ?? ((method, params) => jsonRpc(rpcUrl!, method, params));
  const notes: string[] = [];
  const updates: DraftFact[] = [];
  try {
    const code = await rpc("eth_getCode", [address, "latest"]);
    const bytecode = typeof code === "string" ? code : "";
    if (!bytecode || bytecode === "0x" || bytecode === "0x0") {
      notes.push("The address has no contract bytecode on the configured RPC.");
      updates.push(
        patch(
          contract!,
          "NEEDS_CONFIRMATION",
          0.7,
          "ethereum_rpc",
          "eth_getCode returned empty bytecode.",
          "This address is not a deployed contract on the RPC network.",
        ),
      );
      return { configured: true, notes, facts: updates };
    }
    const [symbolRaw, decimalsRaw, supplyRaw, ownerRaw] = await Promise.all([
      rpc("eth_call", [{ to: address, data: SELECTORS.symbol }, "latest"]).catch(() => null),
      rpc("eth_call", [{ to: address, data: SELECTORS.decimals }, "latest"]).catch(() => null),
      rpc("eth_call", [{ to: address, data: SELECTORS.totalSupply }, "latest"]).catch(() => null),
      rpc("eth_call", [{ to: address, data: SELECTORS.owner }, "latest"]).catch(() => null),
    ]);
    const symbol = decodeString(symbolRaw);
    const decimals = decodeSmallInt(decimalsRaw);
    const supply = decodeUint(supplyRaw);
    const owner = decodeAddress(ownerRaw);
    const ticker = facts
      .find((fact) => fact.fieldKey === "identity.ticker")
      ?.value?.replace(/^\$/, "")
      .toLowerCase();
    if (symbol && ticker && symbol.toLowerCase() === ticker) {
      updates.push(patch(contract!, "VERIFIED", 0.93, "ethereum_rpc", `symbol() returned ${symbol} and bytecode is present.`, null));
    } else if (symbol) {
      notes.push(`On-chain symbol() returned ${symbol}. It does not match the website ticker, so the address is not marked verified.`);
      updates.push(
        patch(contract!, "CONFLICTING", 0.5, "ethereum_rpc", `symbol()=${symbol}`, "On-chain symbol does not match the website ticker."),
      );
    } else {
      notes.push("Bytecode exists, but symbol() could not be decoded. The address is not marked verified.");
    }
    if (decimals != null) {
      updates.push(baseFact("token.decimals", String(decimals), "VERIFIED", 0.9, "ethereum_rpc", `decimals()=${decimals}`));
    }
    if (supply != null && decimals != null) {
      const human = formatUnits(supply, decimals);
      const website = facts.find((fact) => fact.fieldKey === "token.totalSupply");
      const websiteNumber = website?.value?.replace(/[, ]/g, "");
      const matches = websiteNumber && Number(websiteNumber) === Number(human);
      updates.push(
        baseFact(
          "token.totalSupply",
          human,
          matches || !website?.value ? "VERIFIED" : "CONFLICTING",
          matches ? 0.92 : 0.4,
          "ethereum_rpc",
          `totalSupply()=${human}`,
          matches ? null : `Website reported ${website?.value}. On-chain total supply is ${human}.`,
        ),
      );
    }
    if (owner) {
      const renounced = /^0x0{40}$/i.test(owner) || /^0x0{40}dead$/i.test(owner);
      updates.push(
        baseFact(
          "token.ownershipStatus",
          renounced ? "Owner is the zero or burn address" : `Owner call returned ${owner}`,
          renounced ? "VERIFIED" : "REPORTED_UNVERIFIED",
          renounced ? 0.9 : 0.7,
          "ethereum_rpc",
          `owner()=${owner}`,
          "This is the Ownable owner() result when the call succeeds. It does not by itself prove liquidity was burned.",
        ),
      );
    } else {
      notes.push("owner() did not return a decodable address. A website renounce claim stays unverified.");
    }
    notes.push(
      "LP token balances were not checked. A burned-LP marketing claim stays unverified unless a pair address and LP balance are read.",
    );
  } catch (error) {
    notes.push(`Ethereum RPC check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return { configured: true, notes, facts: updates };
}

async function jsonRpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "RPC error");
  return payload.result ?? null;
}

function patch(
  fact: DraftFact,
  status: DraftFact["status"],
  confidence: number,
  sourceType: string,
  excerpt: string,
  notes: string | null,
): DraftFact {
  return {
    ...fact,
    status,
    confidence,
    sourceType,
    excerpt,
    conflictNotes: notes ?? fact.conflictNotes,
    evidence: [...fact.evidence, { sourceUrl: "ethereum-rpc", sourceType, excerpt }],
  };
}

function baseFact(
  fieldKey: string,
  value: string,
  status: DraftFact["status"],
  confidence: number,
  sourceType: string,
  excerpt: string,
  notes?: string | null,
): DraftFact {
  return {
    fieldKey,
    label: fieldKey,
    value,
    status,
    confidence,
    sourceUrl: "ethereum-rpc",
    sourceType,
    excerpt,
    conflictNotes: notes ?? null,
    evidence: [{ sourceUrl: "ethereum-rpc", sourceType, excerpt }],
  };
}

function decodeString(value: unknown) {
  if (typeof value !== "string") return null;
  const hex = value.replace(/^0x/, "");
  if (hex.length < 128) return null;
  const length = Number.parseInt(hex.slice(64, 128), 16);
  if (!Number.isFinite(length) || length <= 0 || length > 64) return null;
  const data = hex.slice(128, 128 + length * 2);
  const text = Buffer.from(data, "hex").toString("utf8").replace(/\0/g, "").trim();
  return text || null;
}

function decodeSmallInt(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const n = Number(BigInt(value));
    return n >= 0 && n <= 36 ? n : null;
  } catch {
    return null;
  }
}

function decodeUint(value: unknown) {
  if (typeof value !== "string" || value === "0x") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function decodeAddress(value: unknown) {
  if (typeof value !== "string") return null;
  const hex = value.replace(/^0x/, "").padStart(64, "0");
  if (hex.length < 40) return null;
  return `0x${hex.slice(-40)}`;
}

function formatUnits(value: bigint, decimals: number) {
  const text = value.toString().padStart(decimals + 1, "0");
  const whole = text.slice(0, text.length - decimals);
  return whole.replace(/^0+/, "") || "0";
}
