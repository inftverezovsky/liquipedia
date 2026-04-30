const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const results = await prisma.searchResult.findMany({
    where: { title: { contains: '1win Essence' } },
    select: { title: true, dates: true }
  });
  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main();
