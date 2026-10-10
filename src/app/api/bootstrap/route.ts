import { cookies } from "next/headers";
import { PROJECT_COOKIE, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const jar = await cookies();
    const [projects, notifications, organization] = await Promise.all([
      prisma.project.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { updatedAt: "desc" },
        include: { profile: true },
      }),
      prisma.notification.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 12 }),
      prisma.organization.findUnique({ where: { id: user.organizationId }, include: { members: { include: { user: true } } } }),
    ]);
    return ok({
      user,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            timezone: organization.timezone,
            currency: organization.currency,
            retentionDays: organization.retentionDays,
            rankWeights: organization.rankWeights,
            members: organization.members.map((member) => ({
              id: member.id,
              role: member.role,
              email: member.user.email,
              name: member.user.name,
            })),
          }
        : null,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        websiteUrl: project.websiteUrl,
        status: project.status,
        ticker: project.profile?.ticker ?? null,
        updatedAt: project.updatedAt,
      })),
      activeProjectId: jar.get(PROJECT_COOKIE)?.value || projects[0]?.id || null,
      notifications,
    });
  } catch (error) {
    return fail(error);
  }
}
