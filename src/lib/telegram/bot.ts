import { createHmac, timingSafeEqual } from "crypto";

export type BotFact = { label: string; value: string | null; status: string; isPrivate?: boolean };

export type BotContext = {
  name: string;
  website: string | null;
  facts: BotFact[];
  launchAt: string | null;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string };
  };
};

export function verifyWebhookSecret(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function commandOf(text: string | undefined) {
  if (!text) return null;
  const match = text.trim().match(/^\/([a-z_]+)(?:@[\w_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] || "").trim() };
}

export function handleBotCommand(command: string, ctx: BotContext, isAdmin: boolean) {
  const fact = (label: string) => ctx.facts.find((item) => item.label === label && !item.isPrivate);
  const line = (label: string, empty: string) => {
    const found = fact(label);
    if (!found?.value) return empty;
    if (found.status === "VERIFIED") return found.value;
    return `${found.value} (${found.status.replaceAll("_", " ").toLowerCase()})`;
  };
  switch (command) {
    case "start":
      return `Welcome to ${ctx.name}. This bot shares the project's published research. Use /subscribe to opt in to launch notices. We do not message people who have not opted in. /help lists commands.`;
    case "help":
      return "Commands: /project /website /tokenomics /community /launch /contract /links /subscribe /unsubscribe /help";
    case "project":
      return `${ctx.name}\n${line("Short description", "No description is stored.")}`;
    case "website":
      return ctx.website || "Official website: not stored.";
    case "tokenomics":
      return [
        `Supply: ${line("Total supply", "Unknown")}`,
        `Buy tax: ${line("Buy tax", "Unknown")}`,
        `Sell tax: ${line("Sell tax", "Unknown")}`,
        `Liquidity: ${line("Liquidity status", "Unknown")}`,
        `Ownership: ${line("Ownership status", "Unknown")}`,
      ].join("\n");
    case "community":
      return `Telegram: ${line("Telegram", "Not confirmed.")}\nX: ${line("X", "Unknown")}`;
    case "launch":
      return ctx.launchAt ? `Launch time on file: ${ctx.launchAt}` : "Launch time: not confirmed.";
    case "contract":
      return fact("Contract address")?.status === "VERIFIED" && fact("Contract address")?.value
        ? fact("Contract address")!.value!
        : "Not published.";
    case "links":
      return [`Website: ${ctx.website || "Unknown"}`, `Telegram: ${line("Telegram", "Unknown")}`, `X: ${line("X", "Unknown")}`].join("\n");
    case "subscribe":
      return "You are opted in to launch notices for this project. Use /unsubscribe to stop.";
    case "unsubscribe":
      return "You are opted out. We will not send you further launch notices.";
    case "admin":
      return isAdmin
        ? "Admin commands are available in the desk, not as a mass-send from chat. Approve messages in TokenLaunch AI first."
        : "That command is limited to configured admin ids.";
    default:
      return "Unknown command. Try /help.";
  }
}

export type OutboundResult = { ok: boolean; description?: string; status?: number };

export async function telegramApi(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: unknown;
    parameters?: { retry_after?: number };
  };
  return { http: response.status, payload };
}

export function redactToken(value: string, token: string) {
  return token ? value.split(token).join("[redacted]") : value;
}

export function deliveryKey(projectId: string, updateId: number) {
  return `tg:${projectId}:${updateId}`;
}

export function signPayload(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
