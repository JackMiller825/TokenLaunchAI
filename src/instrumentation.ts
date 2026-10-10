export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInlineJobs } = await import("./instrumentation-node");
    await startInlineJobs();
  }
}
