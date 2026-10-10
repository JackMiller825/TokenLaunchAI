import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { commandOf, deliveryKey, handleBotCommand, telegramApi, verifyWebhookSecret } from "@/lib/telegram/bot";

const lastReply = new Map<string, number>();

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { telegram: true, facts: true, profile: true } });
  if (!project) return Response.json({ ok: false }, { status: 404 });
  const secret = project.telegram?.webhookSecret || env.telegramWebhookSecret;
  if (!verifyWebhookSecret(secret, request.headers.get("x-telegram-bot-api-secret-token"))) {
    return Response.json({ ok: false, error: "Webhook secret rejected." }, { status: 401 });
  }
  const update = (await request.json()) as {
    update_id?: number;
    message?: { message_id: number; text?: string; chat: { id: number }; from?: { id: number; username?: string } };
  };
  if (!update.update_id || !update.message) return Response.json({ ok: true });
  try {
    await prisma.scheduledJob.create({
      data: {
        projectId,
        type: "telegram.update",
        payload: { updateId: update.update_id },
        dedupeKey: deliveryKey(projectId, update.update_id),
        status: "COMPLETED",
      },
    });
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }
  const command = commandOf(update.message.text);
  const fromId = String(update.message.from?.id || "");
  const key = `${projectId}:${update.message.chat.id}`;
  const now = Date.now();
  if ((lastReply.get(key) || 0) > now - 1500) return Response.json({ ok: true, limited: true });
  lastReply.set(key, now);
  if (command?.name === "subscribe" || command?.name === "start") {
    await prisma.telegramSubscriber.upsert({
      where: { projectId_telegramUserId: { projectId, telegramUserId: fromId } },
      create: { projectId, telegramUserId: fromId, username: update.message.from?.username, optedIn: true, optedInAt: new Date() },
      update: { optedIn: true, optedInAt: new Date(), optedOutAt: null, username: update.message.from?.username },
    });
  }
  if (command?.name === "unsubscribe") {
    await prisma.telegramSubscriber.upsert({
      where: { projectId_telegramUserId: { projectId, telegramUserId: fromId } },
      create: { projectId, telegramUserId: fromId, username: update.message.from?.username, optedIn: false, optedOutAt: new Date() },
      update: { optedIn: false, optedOutAt: new Date() },
    });
  }
  const reply = handleBotCommand(
    command?.name || "",
    {
      name: project.profile?.name || project.name,
      website: project.websiteUrl,
      launchAt: project.launchAt?.toISOString() ?? null,
      facts: project.facts.map((fact) => ({ label: fact.label, value: fact.value, status: fact.status, isPrivate: fact.isPrivate })),
    },
    env.telegramAdminIds.includes(fromId),
  );
  if (env.telegramToken && reply) {
    await telegramApi(env.telegramToken, "sendMessage", { chat_id: update.message.chat.id, text: reply });
  }
  return Response.json({ ok: true });
}
