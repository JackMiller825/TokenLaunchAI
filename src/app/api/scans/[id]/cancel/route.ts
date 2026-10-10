import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/server/http";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const scan = await prisma.websiteScan.findFirst({ where: { id, project: { organizationId: user.organizationId } } });
    if (!scan) return ok({ error: "Scan not found." }, { status: 404 });
    await prisma.websiteScan.update({ where: { id }, data: { cancelRequested: true, stageLabel: "Cancellation requested" } });
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
