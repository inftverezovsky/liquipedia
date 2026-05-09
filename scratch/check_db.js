const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.globalSettings.findMany().then(s => {
    console.log(JSON.stringify(s, null, 2));
}).catch(err => {
    console.error(err);
}).finally(() => {
    prisma.$disconnect();
});
