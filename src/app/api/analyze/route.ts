import { createAnalysis } from "@/lib/server/desk";
import { fail, ok } from "@/lib/server/http";
import { requireUser } from "@/lib/auth";

const recent = new Map<string, number[]>();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const now = Date.now();
    const hits = (recent.get(user.id) ?? []).filter((time) => now - time < 60 * 60 * 1000);
    if (hits.length >= 12) return ok({ error: "Too many analyses this hour. Wait before starting another." }, { status: 429 });
    hits.push(now);
    recent.set(user.id, hits);
    const result = await createAnalysis(user, await request.json());
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
