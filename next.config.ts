import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "bcryptjs", "pdf-lib", "jszip", "cheerio"],
};

export default nextConfig;
