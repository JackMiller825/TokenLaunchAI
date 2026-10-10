import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  decideApproval,
  patchOpportunity,
  reportFile,
  updateDraft,
  updateFact,
  updateReadiness,
  updateTask,
  addQuote,
} from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; resource: string; itemId: string }> }) {
  try {
    const user = await requireUser();
    const { id, resource, itemId } = await context.params;
    const body = await request.json();
    if (resource === "facts") return ok({ fact: await updateFact(user, id, itemId, body) });
    if (resource === "opportunities") return ok({ opportunity: await patchOpportunity(user, id, itemId, body) });
    if (resource === "drafts") return ok({ draft: await updateDraft(user, id, itemId, body) });
    if (resource === "tasks") return ok({ task: await updateTask(user, id, itemId, body) });
    if (resource === "readiness") return ok({ item: await updateReadiness(user, id, itemId, body) });
    if (resource === "approvals") return ok({ approval: await decideApproval(user, id, itemId, body) });
    if (resource === "assets") {
      const { assertRole, loadProject } = await import("@/lib/auth");
      assertRole(user, "MARKETING");
      await loadProject(user, id);
      const existing = await prisma.creativeAsset.findFirst({ where: { id: itemId, projectId: id } });
      if (!existing) return ok({ error: "Asset not found." }, { status: 404 });
      const asset = await prisma.creativeAsset.update({ where: { id: existing.id }, data: { approved: Boolean(body.approved) } });
      return ok({ asset });
    }
    return ok({ error: "Unknown resource." }, { status: 404 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string; resource: string; itemId: string }> }) {
  try {
    const user = await requireUser();
    const { id, resource, itemId } = await context.params;
    if (resource === "quotes") return ok({ quote: await addQuote(user, id, itemId, await request.json()) });
    if (resource === "reports") {
      const url = new URL(request.url);
      const file = await reportFile(user, id, itemId, url.searchParams.get("format") || "md");
      return new Response(new Uint8Array(file.body), {
        headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename=${file.filename}` },
      });
    }
    return ok({ error: "Unknown action." }, { status: 404 });
  } catch (error) {
    return fail(error);
  }
}
