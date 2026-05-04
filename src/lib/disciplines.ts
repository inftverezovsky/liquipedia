import { prisma } from "@/lib/db";
import { getLiquipediaDota2ApiUrl, getLiquipediaCounterStrikeApiUrl, getLiquipediaLolApiUrl, getLiquipediaValorantApiUrl } from "@/lib/env";

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

export async function getOrCreateCounterStrikeDiscipline() {
  return prisma.discipline.upsert({
    where: { slug: "counterstrike" },
    update: {
      name: "Counter-Strike",
      baseApiUrl: getLiquipediaCounterStrikeApiUrl(),
      isEnabled: true
    },
    create: {
      slug: "counterstrike",
      name: "Counter-Strike",
      baseApiUrl: getLiquipediaCounterStrikeApiUrl(),
      isEnabled: true
    }
  });
}

export async function getOrCreateLeagueOfLegendsDiscipline() {
  return prisma.discipline.upsert({
    where: { slug: "leagueoflegends" },
    update: {
      name: "League of Legends",
      baseApiUrl: getLiquipediaLolApiUrl(),
      isEnabled: true
    },
    create: {
      slug: "leagueoflegends",
      name: "League of Legends",
      baseApiUrl: getLiquipediaLolApiUrl(),
      isEnabled: true
    }
  });
}

export async function getOrCreateValorantDiscipline() {
  return prisma.discipline.upsert({
    where: { slug: "valorant" },
    update: {
      name: "Valorant",
      baseApiUrl: getLiquipediaValorantApiUrl(),
      isEnabled: true
    },
    create: {
      slug: "valorant",
      name: "Valorant",
      baseApiUrl: getLiquipediaValorantApiUrl(),
      isEnabled: true
    }
  });
}
