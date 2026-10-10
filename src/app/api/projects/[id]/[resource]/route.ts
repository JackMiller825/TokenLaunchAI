import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addMetric,
  adsCheck,
  askAssistant,
  assetZip,
  duplicateProject,
  generateOneDraft,
  importOpportunities,
  makeReport,
  rediscover,
  requestApproval,
  saveBudget,
} from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; resource: string }> }) {
  try {
    const user = await requireUser();
    const { id, resource } = await context.params;
    const url = new URL(request.url);
    if (resource === "assets-export") {
      const body = await assetZip(user, id);
      return new Response(new Uint8Array(body), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=creative-assets.zip" },
      });
    }
    if (resource === "activity") {
      const logs = await prisma.auditLog.findMany({
        where: { projectId: id, organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return ok({ logs });
    }
    if (resource === "comments") {
      const comments = await prisma.comment.findMany({
        where: { projectId: id, project: { organizationId: user.organizationId } },
        include: { user: true },
        orderBy: { createdAt: "desc" },
      });
      return ok({
        comments: comments.map((comment) => ({
          ...comment,
          user: comment.user ? { name: comment.user.name, email: comment.user.email } : null,
        })),
      });
    }
    if (resource === "community") {
      const [subscribers, integration, faq] = await Promise.all([
        prisma.telegramSubscriber.findMany({
          where: { projectId: id, project: { organizationId: user.organizationId } },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.telegramIntegration.findUnique({ where: { projectId: id } }),
        prisma.project.findFirst({ where: { id, organizationId: user.organizationId }, select: { faq: true, telegramTarget: true } }),
      ]);
      return ok({
        subscribers,
        integration: integration ? { ...integration, webhookSecret: undefined } : null,
        faq: faq?.faq ?? [],
        telegramTarget: faq?.telegramTarget ?? null,
      });
    }
    if (url.searchParams.get("format") === "csv" && ["opportunities", "metrics", "facts", "tasks"].includes(resource)) {
      const { projectPayload } = await import("@/lib/server/desk");
      const { rowsToCsv } = await import("@/lib/reports/build");
      const payload = await projectPayload(user, id);
      const table =
        resource === "opportunities"
          ? payload.opportunities.map((item) => ({
              channel: item.name,
              telegramUrl: item.telegramUrl,
              category: item.category,
              language: item.language,
              subscribers: item.subscribers,
              averageViews: item.averageViews,
              priceUsd: item.priceUsd,
              cpmUsd: item.cpmUsd,
              contact: item.contact,
              status: item.status,
              sourceUrl: item.sourceUrl,
              recommendation: item.recommendation,
            }))
          : resource === "metrics"
            ? payload.metrics.map((metric) => ({
                recordedAt: metric.recordedAt.toISOString(),
                name: metric.name,
                value: metric.value,
                unit: metric.unit,
                kind: metric.kind,
                source: metric.source,
              }))
            : resource === "tasks"
              ? payload.tasks.map((task) => ({
                  name: task.name,
                  owner: task.owner,
                  dueAt: task.dueAt ? task.dueAt.toISOString() : "",
                  channel: task.channel,
                  status: task.status,
                  budgetUsd: task.budgetUsd,
                }))
              : payload.facts
                  .filter((fact) => !fact.isPrivate)
                  .map((fact) => ({
                    field: fact.fieldKey,
                    label: fact.label,
                    value: fact.value,
                    status: fact.status,
                    confidence: fact.confidence,
                    sourceUrl: fact.sourceUrl,
                  }));
      return new Response(rowsToCsv(table), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${resource}.csv` },
      });
    }
    if (resource === "reports" && url.searchParams.get("reportId")) {
      const { reportFile } = await import("@/lib/server/desk");
      const file = await reportFile(user, id, url.searchParams.get("reportId")!, url.searchParams.get("format") || "md");
      return new Response(new Uint8Array(file.body), {
        headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename=${file.filename}` },
      });
    }
    const { projectPayload } = await import("@/lib/server/desk");
    const payload = await projectPayload(user, id);
    const map: Record<string, unknown> = {
      facts: payload.facts,
      strategy: payload.strategy,
      intelligence: payload.intelligence,
      opportunities: payload.opportunities,
      drafts: payload.drafts,
      assets: payload.assets,
      campaigns: payload.campaigns,
      tasks: payload.tasks,
      readiness: { items: payload.readiness, score: payload.readinessScore },
      metrics: payload.metrics,
      approvals: payload.approvals,
      reports: payload.reports,
      budget: payload.project.budgetPlan,
    };
    if (!(resource in map)) return ok({ error: "Unknown resource." }, { status: 404 });
    return ok({ [resource]: map[resource] });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string; resource: string }> }) {
  try {
    const user = await requireUser();
    const { id, resource } = await context.params;
    const body = resource === "import" ? null : await request.json().catch(() => ({}));
    if (resource === "duplicate") return ok({ project: await duplicateProject(user, id) });
    if (resource === "discover") return ok(await rediscover(user, id));
    if (resource === "import") return ok(await importOpportunities(user, id, await request.text()));
    if (resource === "drafts") return ok({ draft: await generateOneDraft(user, id, body) });
    if (resource === "metrics") return ok({ metric: await addMetric(user, id, body) });
    if (resource === "reports")
      return ok({ report: await makeReport(user, id, String((body as { kind?: string }).kind || "Token Research Report")) });
    if (resource === "assistant")
      return ok(await askAssistant(user, id, String((body as { question?: string }).question || "What should I do next?")));
    if (resource === "budget") return ok({ plan: await saveBudget(user, id, body) });
    if (resource === "approvals") return ok({ approval: await requestApproval(user, id, body) });
    if (resource === "ads-check")
      return ok(await adsCheck(String((body as { text?: string }).text || ""), (body as { destination?: string }).destination || null));
    if (resource === "comments") {
      const { assertRole } = await import("@/lib/auth");
      assertRole(user, "ANALYST");
      const comment = await prisma.comment.create({
        data: {
          projectId: id,
          userId: user.id,
          targetType: String((body as { targetType?: string }).targetType || "project"),
          targetId: String((body as { targetId?: string }).targetId || id),
          body: String((body as { body?: string }).body || "").slice(0, 4000),
        },
      });
      return ok({ comment });
    }
    if (resource === "faq") {
      const { assertRole, loadProject } = await import("@/lib/auth");
      assertRole(user, "MARKETING");
      await loadProject(user, id);
      const project = await prisma.project.update({ where: { id }, data: { faq: (body as { faq: unknown }).faq as object } });
      return ok({ faq: project.faq });
    }
    if (resource === "tasks") {
      const { assertRole, loadProject } = await import("@/lib/auth");
      assertRole(user, "MARKETING");
      await loadProject(user, id);
      let campaign = await prisma.campaign.findFirst({ where: { projectId: id } });
      if (!campaign) campaign = await prisma.campaign.create({ data: { projectId: id, name: "Launch preparation" } });
      const task = await prisma.campaignTask.create({
        data: {
          projectId: id,
          campaignId: campaign.id,
          name: String((body as { name?: string }).name || "New task"),
          description: String((body as { description?: string }).description || ""),
          owner: (body as { owner?: string }).owner || null,
          channel: (body as { channel?: string }).channel || "telegram",
          dueAt: (body as { dueAt?: string }).dueAt ? new Date((body as { dueAt: string }).dueAt) : null,
          reusable: true,
        },
      });
      return ok({ task });
    }
    return ok({ error: "Unknown action." }, { status: 404 });
  } catch (error) {
    return fail(error);
  }
}
