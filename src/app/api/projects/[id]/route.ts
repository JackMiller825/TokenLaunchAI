import { z } from "zod";
import { assertRole, loadProject, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { projectPayload } from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await projectPayload(user, id));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertRole(user, "MARKETING");
    const { id } = await context.params;
    await loadProject(user, id);
    const body = z
      .object({
        name: z.string().min(2).max(120).optional(),
        launchAt: z.string().nullable().optional(),
        timezone: z.string().max(80).optional(),
        objectives: z.string().max(2000).nullable().optional(),
        telegramTarget: z.string().max(300).nullable().optional(),
        audiences: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional(),
        languages: z.array(z.string()).optional(),
      })
      .parse(await request.json());
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...("name" in body ? { name: body.name } : {}),
        ...("timezone" in body ? { timezone: body.timezone } : {}),
        ...("objectives" in body ? { objectives: body.objectives } : {}),
        ...("telegramTarget" in body ? { telegramTarget: body.telegramTarget } : {}),
        ...("audiences" in body ? { audiences: body.audiences } : {}),
        ...("countries" in body ? { countries: body.countries } : {}),
        ...("languages" in body ? { languages: body.languages } : {}),
        ...(body.launchAt !== undefined ? { launchAt: body.launchAt ? new Date(body.launchAt) : null } : {}),
      },
    });
    return ok({ project });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const { id } = await context.params;
    await loadProject(user, id);
    await prisma.project.delete({ where: { id } });
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
