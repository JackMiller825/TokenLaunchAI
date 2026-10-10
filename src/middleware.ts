import { NextResponse, type NextRequest } from "next/server";

const PAGES = [
  "/dashboard",
  "/projects",
  "/analyzer",
  "/intelligence",
  "/strategy",
  "/discovery",
  "/telegram",
  "/creative",
  "/campaigns",
  "/calendar",
  "/readiness",
  "/community",
  "/analytics",
  "/reports",
  "/integrations",
  "/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("tl_session")?.value;
  const isPage = PAGES.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isApi = pathname.startsWith("/api/");
  const publicApi = pathname.startsWith("/api/auth") || pathname.startsWith("/api/health") || pathname.startsWith("/api/telegram/webhook");
  if (!session && isPage) {
    const url = request.nextUrl.clone();
    if (process.env.AUTH_MODE === "credentials") {
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
    } else {
      url.pathname = "/api/auth/bootstrap";
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }
  if (!session && isApi && !publicApi) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
