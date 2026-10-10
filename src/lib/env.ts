export type AuthMode = "dev-auto" | "credentials";

function read(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function authMode(): AuthMode {
  const explicit = read("AUTH_MODE");
  if (explicit === "credentials" || explicit === "dev-auto") return explicit;
  return process.env.NODE_ENV === "production" ? "credentials" : "dev-auto";
}

export const env = {
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get redisUrl() {
    return read("REDIS_URL");
  },
  get sessionSecret() {
    return read("SESSION_SECRET", "dev-only-session-secret-change-me");
  },
  get encryptionKey() {
    return read("ENCRYPTION_KEY");
  },
  get authMode(): AuthMode {
    return authMode();
  },
  get seedEmail() {
    return read("SEED_EMAIL", "owner@tokenlaunch.local").toLowerCase();
  },
  get seedPassword() {
    return read("SEED_PASSWORD", "launch-desk-dev");
  },
  get seedName() {
    return read("SEED_NAME", "Launch Manager");
  },
  get appUrl() {
    return read("APP_URL", "http://127.0.0.1:43123").replace(/\/$/, "");
  },
  get openaiKey() {
    return read("OPENAI_API_KEY");
  },
  get openaiModel() {
    return read("OPENAI_MODEL", "gpt-4o-mini");
  },
  get imageProvider() {
    return read("IMAGE_PROVIDER", "none");
  },
  get searchProvider() {
    return read("SEARCH_PROVIDER", "none");
  },
  get searchKey() {
    return read("SEARCH_API_KEY");
  },
  get ethRpcUrl() {
    return read("ETH_RPC_URL");
  },
  get etherscanKey() {
    return read("ETHERSCAN_API_KEY");
  },
  get telegramToken() {
    return read("TELEGRAM_BOT_TOKEN");
  },
  get telegramWebhookSecret() {
    return read("TELEGRAM_WEBHOOK_SECRET");
  },
  get telegramAdminIds() {
    return read("TELEGRAM_ADMIN_IDS")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  },
  get telegramPoll() {
    return read("TELEGRAM_POLL") === "1";
  },
  get jobRunner(): "inline" | "bullmq" {
    return read("JOB_RUNNER", "inline") === "bullmq" ? "bullmq" : "inline";
  },
  get playwrightEnabled() {
    return read("PLAYWRIGHT_ENABLED") === "1";
  },
};

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
    throw new Error("SESSION_SECRET must be a long random value in production.");
  }
  if (authMode() === "dev-auto") {
    throw new Error("AUTH_MODE=dev-auto is not allowed in production.");
  }
}
