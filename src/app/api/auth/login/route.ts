import { z } from "zod";
import { cookieOptions, loginWithPassword, signSession } from "@/lib/auth";
import { fail, ok } from "@/lib/server/http";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await loginWithPassword(body.email, body.password);
    if (!result) return ok({ error: "Email or password is wrong." }, { status: 401 });
    const token = await signSession({ uid: result.user.id, oid: result.membership.organizationId, role: result.membership.role });
    const response = ok({ ok: true });
    response.cookies.set("tl_session", token, cookieOptions());
    return response;
  } catch (error) {
    return fail(error);
  }
}
