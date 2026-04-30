import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.searchRequest.deleteMany();
  console.log('Cache cleared');
}
main().finally(() => prisma.$disconnect());
