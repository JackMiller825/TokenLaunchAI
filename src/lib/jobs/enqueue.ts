import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env";
import { runScan } from "./pipeline";

const inflight = new Set<string>();
let queue: Queue | null = null;

function getQueue() {
  if (!env.redisUrl) return null;
  if (!queue) {
    queue = new Queue("tokenlaunch", { connection: new IORedis(env.redisUrl, { maxRetriesPerRequest: null }) });
  }
  return queue;
}

export async function enqueueScan(scanId: string) {
  if (env.jobRunner === "bullmq" && env.redisUrl) {
    const jobs = getQueue();
    if (jobs) {
      await jobs.add("scan", { scanId }, { jobId: `scan-${scanId}`, removeOnComplete: 100, removeOnFail: 100 });
      return "bullmq" as const;
    }
  }
  if (!inflight.has(scanId)) {
    inflight.add(scanId);
    setTimeout(() => {
      void runScan(scanId).finally(() => inflight.delete(scanId));
    }, 30);
  }
  return "inline" as const;
}
