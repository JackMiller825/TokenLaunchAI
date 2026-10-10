import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  return Response.json({ ok: database === "ok", database, time: new Date().toISOString() });
}
