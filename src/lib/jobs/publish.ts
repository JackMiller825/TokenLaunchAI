import { prisma } from "../db";
import { env } from "../env";
import { telegramApi } from "../telegram/bot";

export async function publishApproved(taskId: string) {
  const task = await prisma.campaignTask.findUnique({ where: { id: taskId }, include: { project: { include: { telegram: true } } } });
  if (!task) return;
  if (task.status !== "APPROVED" && task.status !== "SCHEDULED") {
    await prisma.campaignTask.update({
      where: { id: task.id },
      data: { status: "FAILED", result: "Publish stopped because the task is not approved." },
    });
    return;
  }
  const token = env.telegramToken;
  const chatId = task.project.telegram?.channelId || task.project.telegram?.groupId;
  if (!token || !chatId) {
    await prisma.campaignTask.update({
      where: { id: task.id },
      data: { status: "FAILED", result: "Telegram bot token or destination chat is not configured. Nothing was sent." },
    });
    return;
  }
  const sent = await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: task.message || task.description || task.name,
  });
  if (!sent.payload.ok) {
    await prisma.campaignTask.update({
      where: { id: task.id },
      data: { status: "FAILED", result: sent.payload.description || `Telegram HTTP ${sent.http}` },
    });
    return;
  }
  await prisma.campaignTask.update({
    where: { id: task.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), result: "Sent through the Telegram Bot API." },
  });
}

export async function processDueJobs() {
  const due = await prisma.scheduledJob.findMany({ where: { status: "QUEUED", runAt: { lte: new Date() } }, take: 10 });
  for (const job of due) {
    const claimed = await prisma.scheduledJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      const payload = job.payload as { taskId?: string };
      if (job.type === "publish" && payload.taskId) await publishApproved(payload.taskId);
      if (job.type === "reminder") {
        const body = (job.payload as { body?: string; title?: string; href?: string }).body || "Scheduled reminder";
        const project = job.projectId ? await prisma.project.findUnique({ where: { id: job.projectId } }) : null;
        if (project) {
          await prisma.notification.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              title: (job.payload as { title?: string }).title || "Reminder",
              body,
              href: (job.payload as { href?: string }).href || "/calendar",
            },
          });
        }
      }
      await prisma.scheduledJob.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    } catch (error) {
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: error instanceof Error ? error.message : "Job failed" },
      });
    }
  }
}
