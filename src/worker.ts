import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "./lib/env";
import { runScan } from "./lib/jobs/pipeline";
import { processDueJobs, publishApproved } from "./lib/jobs/publish";

async function main() {
  if (!env.redisUrl) {
    console.error("REDIS_URL is required for the worker.");
    process.exit(1);
  }
  const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker(
    "tokenlaunch",
    async (job) => {
      if (job.name === "scan") await runScan(String(job.data.scanId));
      if (job.name === "publish") await publishApproved(String(job.data.taskId));
    },
    { connection },
  );
  setInterval(() => {
    void processDueJobs();
  }, 15_000);
  console.log("TokenLaunch worker listening on queue tokenlaunch");
  await new Promise<void>((resolve) => worker.on("closed", () => resolve()));
}

void main();
