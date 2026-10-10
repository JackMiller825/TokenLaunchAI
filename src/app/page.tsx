import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeClient } from "@/components/home-client";
import { authMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jar = await cookies();
  if (!jar.get("tl_session")) {
    if (authMode() === "credentials") redirect("/login");
    redirect("/api/auth/bootstrap?next=/");
  }
  return <HomeClient />;
}
