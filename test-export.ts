import { prisma } from './src/lib/db';
import { generateInternalTeamId, isPlaceholderTeam } from './src/lib/teams';

async function test() {
  const tournament = await prisma.tournament.findUnique({
    where: { id: 'cmor8gj1t000ejyibqms0xzaf' },
    include: { matches: true }
  });

  if (!tournament) return console.log('not found');

  const teamNames = new Set<string>();
  tournament.matches.forEach((m: any) => {
    if (m.teamAName) teamNames.add(m.teamAName);
    if (m.teamBName) teamNames.add(m.teamBName);
  });
  const mappings = await prisma.teamMapping.findMany({
    where: { liquipediaName: { in: Array.from(teamNames) } }
  });
  const mappingMap = new Map(mappings.map((m: any) => [m.liquipediaName, m]));

  const getTeamInfo = (name: string | null, side: 'A' | 'B') => {
    if (!name || isPlaceholderTeam(name)) {
      return { 
        id: "tbd", 
        name: name || "TBD",
        canonicalName: null,
        internalId: "tbd",
        mappingConfidence: null
      };
    }
    const m = mappingMap.get(name);
    const internalId = generateInternalTeamId(name);
    const platformId = m?.platformId || null;
    
    return { 
      id: platformId || internalId, 
      name: name,
      canonicalName: m?.canonicalName || null,
      internalId,
      mappingConfidence: m?.confidenceScore || null,
      platformId
    };
  };

  const formattedMatches = tournament.matches.map((m: any) => {
    const teamA = getTeamInfo(m.teamAName, 'A');
    const teamB = getTeamInfo(m.teamBName, 'B');
    return {
      matchId: m.matchId,
      matchDateTime: m.matchDateTime,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      teamACanonicalName: teamA.canonicalName,
      teamBCanonicalName: teamB.canonicalName,
      teamAInternalId: teamA.internalId,
      teamBInternalId: teamB.internalId,
      teamAPlatformId: teamA.platformId,
      teamBPlatformId: teamB.platformId,
      teamAMappingConfidence: teamA.mappingConfidence,
      teamBMappingConfidence: teamB.mappingConfidence
    };
  });

  console.log(JSON.stringify(formattedMatches[0], null, 2));
}

test().finally(() => prisma.$disconnect());
