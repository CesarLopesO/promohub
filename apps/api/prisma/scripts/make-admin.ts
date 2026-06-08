import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error("Usage: npm run make:admin -w @promohub/api -- email@example.com");
  }

  const user = await prisma.user.update({
    where: {
      email,
    },
    data: {
      role: "ADMIN",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  console.log(`Promoted ${user.email} (${user.id}) to ${user.role}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
