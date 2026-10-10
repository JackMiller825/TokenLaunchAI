import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const scan = await prisma.websiteScan.findFirst({
      where: { id, project: { organizationId: user.organizationId } },
      include: { pages: true, facts: { include: { evidence: true } } },
    });
    if (!scan) return ok({ error: "Scan not found." }, { status: 404 });
    return ok({ scan });
  } catch (error) {
    return fail(error);
  }
}
