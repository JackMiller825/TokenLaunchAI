import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";

export const SESSION_COOKIE = "tl_session";
export const PROJECT_COOKIE = "tl_project";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: Role;
};

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function signSession(input: { uid: string; oid: string; role: Role }) {
  return new SignJWT({ uid: input.uid, oid: input.oid, role: input.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
}

export async function readSessionToken(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = String(payload.uid || "");
    const oid = String(payload.oid || "");
    const role = String(payload.role || "") as Role;
    if (!uid || !oid) return null;
    return { uid, oid, role };
  } catch {
    return null;
  }
}

export async function ensureSeedUser() {
  const email = env.seedEmail;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: env.seedName, passwordHash: await bcrypt.hash(env.seedPassword, 10) },
    });
  }
  let membership = await prisma.membership.findFirst({ where: { userId: user.id }, include: { organization: true } });
  if (!membership) {
    const organization = await prisma.organization.create({ data: { name: "Launch Desk" } });
    membership = await prisma.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
      include: { organization: true },
    });
  }
  return { user, membership };
}

export async function loginWithPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const membership = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (!membership) return null;
  return { user, membership };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: session.oid, userId: session.uid } },
    include: { user: true },
  });
  if (!membership) return null;
  return {
    id: membership.user.id,
    email: membership.user.email,
    name: membership.user.name,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    const error = new Error("Authentication required.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return user;
}

const RANK: Record<Role, number> = { VIEWER: 1, ANALYST: 2, MARKETING: 3, OWNER: 4 };

export function assertRole(user: SessionUser, minimum: Role) {
  if (RANK[user.role] < RANK[minimum]) {
    const error = new Error("You do not have permission for that action.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}

export async function loadProject(user: SessionUser, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId } });
  if (!project) {
    const error = new Error("Project not found.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  return project;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
