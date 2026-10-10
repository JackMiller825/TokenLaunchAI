export type SeedChannel = {
  username: string;
  category: string;
  language: string;
  why: string;
};

export const SEED_CHANNELS: SeedChannel[] = [
  {
    username: "cointelegraph",
    category: "Crypto news",
    language: "en",
    why: "Public crypto news channel. A new meme token is usually a weak editorial fit unless the operators actually sell a relevant placement.",
  },
  {
    username: "watcherguru",
    category: "Crypto news",
    language: "en",
    why: "Public crypto headline channel. Treat it as a candidate to research, not as a recommended buy.",
  },
  {
    username: "coingecko",
    category: "Market data",
    language: "en",
    why: "Public market-data brand channel. Advertising availability is unknown until you ask.",
  },
  {
    username: "dexscreener",
    category: "DEX analytics",
    language: "en",
    why: "Public DEX analytics channel. Traders use these tools, but a sponsorship price is not published here.",
  },
  {
    username: "uniswap",
    category: "Uniswap",
    language: "en",
    why: "Public Uniswap channel. Unofficial token ads may be unwelcome. Confirm their rules before outreach.",
  },
  {
    username: "whale_alert_io",
    category: "On-chain alerts",
    language: "en",
    why: "Public on-chain alert channel. The audience is analysts. Relevance to a meme launch is limited.",
  },
];
