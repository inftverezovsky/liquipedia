import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { 
  prisma?: PrismaClient;
  portalCache?: Map<string, { data: any, timestamp: number }>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Ensure connections are released and pool is healthy
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export const getPortalCache = () => {
  if (!globalForPrisma.portalCache) {
    globalForPrisma.portalCache = new Map();
  }
  return globalForPrisma.portalCache;
};

// Polyfill BigInt to allow JSON serialization
if (typeof BigInt !== "undefined") {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}
