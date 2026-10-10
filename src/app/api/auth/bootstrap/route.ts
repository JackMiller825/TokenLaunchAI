import { NextResponse } from "next/server";
import { cookieOptions, ensureSeedUser, signSession } from "@/lib/auth";
import { authMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (authMode() === "credentials") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const { user, membership } = await ensureSeedUser();
  const token = await signSession({ uid: user.id, oid: membership.organizationId, role: membership.role });
  const next = new URL(request.url).searchParams.get("next") || "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const response = NextResponse.redirect(new URL(safe, request.url));
  response.cookies.set("tl_session", token, cookieOptions());
  return response;
}
