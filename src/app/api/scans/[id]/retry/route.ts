import { assertRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueScan } from "@/lib/jobs/enqueue";
import { fail, ok } from "@/lib/server/http";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertRole(user, "ANALYST");
    const { id } = await context.params;
    const scan = await prisma.websiteScan.findFirst({ where: { id, project: { organizationId: user.organizationId } } });
    if (!scan) return ok({ error: "Scan not found." }, { status: 404 });
    const next = await prisma.websiteScan.create({
      data: {
        projectId: scan.projectId,
        websiteId: scan.websiteId,
        url: scan.url,
        status: "QUEUED",
        stage: "validate",
        stageLabel: "Retry queued",
      },
    });
    await enqueueScan(next.id);
    return ok({ scanId: next.id, projectId: scan.projectId });
  } catch (error) {
    return fail(error);
  }
}
