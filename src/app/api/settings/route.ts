import bcrypt from "bcryptjs";
import { z } from "zod";
import { assertRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/server/http";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const body = z
      .object({
        name: z.string().min(2).max(120).optional(),
        timezone: z.string().max(80).optional(),
        currency: z.string().max(8).optional(),
        retentionDays: z.number().int().min(7).max(3650).optional(),
        rankWeights: z
          .object({ relevance: z.number(), engagement: z.number(), cost: z.number(), credibility: z.number(), freshness: z.number() })
          .optional(),
      })
      .parse(await request.json());
    if (body.rankWeights) {
      const sum = Object.values(body.rankWeights).reduce((total, value) => total + value, 0);
      if (Math.abs(sum - 1) > 0.02 && Math.abs(sum - 100) > 1)
        throw Object.assign(new Error("Rank weights must add up to 1."), { status: 400 });
    }
    const organization = await prisma.organization.update({ where: { id: user.organizationId }, data: body });
    return ok({ organization });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const body = z
      .object({
        email: z.string().trim().email(),
        name: z.string().trim().min(2).max(80),
        password: z.string().min(8).max(200),
        role: z.enum(["OWNER", "MARKETING", "ANALYST", "VIEWER"]),
      })
      .parse(await request.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const member =
      existing ??
      (await prisma.user.create({
        data: { email: body.email.toLowerCase(), name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
      }));
    const membership = await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: user.organizationId, userId: member.id } },
      create: { organizationId: user.organizationId, userId: member.id, role: body.role },
      update: { role: body.role },
    });
    return ok({ membership: { id: membership.id, role: membership.role, email: member.email, name: member.name } });
  } catch (error) {
    return fail(error);
  }
}
