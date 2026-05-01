import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.discipline.upsert({
    where: { slug: "dota2" },
    update: {
      name: "Dota 2",
      baseApiUrl: process.env.LIQUIPEDIA_DOTA2_API_URL ?? "https://liquipedia.net/dota2/api.php",
      isEnabled: true
    },
    create: {
      slug: "dota2",
      name: "Dota 2",
      baseApiUrl: process.env.LIQUIPEDIA_DOTA2_API_URL ?? "https://liquipedia.net/dota2/api.php",
      isEnabled: true
    }
  });

  await prisma.discipline.upsert({
    where: { slug: "counterstrike" },
    update: {
      name: "Counter-Strike",
      baseApiUrl: process.env.LIQUIPEDIA_COUNTERSTRIKE_API_URL ?? "https://liquipedia.net/counterstrike/api.php",
      isEnabled: true
    },
    create: {
      slug: "counterstrike",
      name: "Counter-Strike",
      baseApiUrl: process.env.LIQUIPEDIA_COUNTERSTRIKE_API_URL ?? "https://liquipedia.net/counterstrike/api.php",
      isEnabled: true
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
