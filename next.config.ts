import type { NextConfig } from "next";

const pages = process.env.PAGES_EXPORT === "1";
const basePath = pages ? process.env.PAGES_BASE_PATH || "/TokenLaunchAI" : "";

const nextConfig: NextConfig = pages
  ? {
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      serverExternalPackages: ["bullmq", "ioredis", "bcryptjs", "pdf-lib", "jszip", "cheerio"],
    };

export default nextConfig;
