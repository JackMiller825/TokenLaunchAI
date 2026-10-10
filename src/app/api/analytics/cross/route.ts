import { requireUser } from "@/lib/auth";
import { crossProject } from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ projects: await crossProject(user) });
  } catch (error) {
    return fail(error);
  }
}
