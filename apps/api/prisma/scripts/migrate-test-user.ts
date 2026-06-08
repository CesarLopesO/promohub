import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LEGACY_USER_ID = "test-user";

async function main() {
  const firstUser = await prisma.user.findFirst({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!firstUser) {
    throw new Error("No users found. Create a user before migrating test-user data.");
  }

  const [sessions, credentials, routes, forwarded] = await prisma.$transaction([
    prisma.whatsAppSession.updateMany({
      where: {
        userId: LEGACY_USER_ID,
      },
      data: {
        userId: firstUser.id,
      },
    }),
    prisma.affiliateCredential.updateMany({
      where: {
        userId: LEGACY_USER_ID,
      },
      data: {
        userId: firstUser.id,
      },
    }),
    prisma.messageRoute.updateMany({
      where: {
        userId: LEGACY_USER_ID,
      },
      data: {
        userId: firstUser.id,
      },
    }),
    prisma.forwardedMessage.updateMany({
      where: {
        userId: LEGACY_USER_ID,
      },
      data: {
        userId: firstUser.id,
      },
    }),
  ]);

  console.log(
    `Migrated test-user data to ${firstUser.email} (${firstUser.id}): ` +
      `${sessions.count} sessions, ${credentials.count} credentials, ` +
      `${routes.count} routes, ${forwarded.count} forwarded messages.`,
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
