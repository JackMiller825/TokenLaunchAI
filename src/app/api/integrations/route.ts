import { requireUser } from "@/lib/auth";
import { integrations, testIntegration } from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";

export async function GET() {
  try {
    await requireUser();
    return ok({ integrations: await integrations() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as { name?: string };
    return ok(await testIntegration(body.name || ""));
  } catch (error) {
    return fail(error);
  }
}
