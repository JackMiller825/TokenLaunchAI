import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { defaultBudget } from "@/lib/marketing/budget";
import { fail, ok } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.project.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { updatedAt: "desc" },
      include: { profile: true, _count: { select: { scans: true } } },
    });
    return ok({ projects: projects.map((project) => ({ ...project, budgetUsd: Number(project.budgetUsd) })) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertRole(user, "MARKETING");
    const body = z
      .object({ name: z.string().trim().min(2).max(120), websiteUrl: z.string().trim().max(500).optional() })
      .parse(await request.json());
    const project = await prisma.project.create({
      data: {
        organizationId: user.organizationId,
        name: body.name,
        websiteUrl: body.websiteUrl || null,
        budgetPlan: defaultBudget(0) as unknown as Prisma.InputJsonValue,
      },
    });
    return ok({ project });
  } catch (error) {
    return fail(error);
  }
}
