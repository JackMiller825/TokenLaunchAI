import { PROJECT_COOKIE, cookieOptions, requireUser, loadProject } from "@/lib/auth";
import { fail, ok } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { projectId?: string };
    if (!body.projectId) throw Object.assign(new Error("Choose a project."), { status: 400 });
    await loadProject(user, body.projectId);
    const response = ok({ projectId: body.projectId });
    response.cookies.set(PROJECT_COOKIE, body.projectId, cookieOptions());
    return response;
  } catch (error) {
    return fail(error);
  }
}
