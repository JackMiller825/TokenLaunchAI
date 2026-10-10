export async function startInlineJobs() {
  if (process.env.JOB_RUNNER === "bullmq") return;
  const { recoverStaleScans } = await import("./lib/jobs/pipeline");
  const { processDueJobs } = await import("./lib/jobs/publish");
  const timer = setInterval(() => {
    void recoverStaleScans();
    void processDueJobs();
  }, 20_000);
  timer.unref?.();
}
