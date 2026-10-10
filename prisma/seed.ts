import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_EMAIL || "owner@tokenlaunch.local").toLowerCase();
  const password = process.env.SEED_PASSWORD || "launch-desk-dev";
  const name = process.env.SEED_NAME || "Launch Manager";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  const membership = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (!membership) {
    const organization = await prisma.organization.create({ data: { name: "Launch Desk" } });
    await prisma.membership.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER" } });
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
