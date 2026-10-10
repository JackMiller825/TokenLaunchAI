import { prisma } from "./db";

export async function audit(input: {
  organizationId: string;
  projectId?: string | null;
  userId?: string | null;
  action: string;
  detail?: string;
  metadata?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      detail: input.detail,
      metadata: input.metadata === undefined ? undefined : (input.metadata as object),
    },
  });
}
