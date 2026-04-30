import { prisma } from "@/lib/db";
import { getLiquipediaDota2ApiUrl } from "@/lib/env";

export async function getOrCreateDota2Discipline() {
  return prisma.discipline.upsert({
    where: { slug: "dota2" },
    update: {
      name: "Dota 2",
      baseApiUrl: getLiquipediaDota2ApiUrl(),
      isEnabled: true
    },
    create: {
      slug: "dota2",
      name: "Dota 2",
      baseApiUrl: getLiquipediaDota2ApiUrl(),
      isEnabled: true
    }
  });
}
