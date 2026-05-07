import { DateTime } from 'luxon';
import { prisma } from '@/lib/db';
import { getAdminSettings } from './getAdminSettings';

export interface FixtMatch {
  date: string;
  team1: number;
  team2: number;
}

export interface FixtPayload {
  shapka: number;
  sport: number;
  max: number;
  match: FixtMatch[];
}

export interface BuildResult {
  payload: FixtPayload | null;
  readyMatchesCount: number;
  skippedMatches: any[];
  warnings: string[];
}

export async function buildFixtPayload(
  tournamentId: string,
  disciplineSlug: string,
  matchIds?: string[]
): Promise<BuildResult> {
  const warnings: string[] = [];
  const skippedMatches: any[] = [];

  // 1. Fetch settings from file config
  const settings = getAdminSettings(disciplineSlug);

  const mapping = await prisma.tournamentAdminMapping.findUnique({
    where: { tournamentId },
  });

  if (!settings) {
    throw new Error(`Admin settings for discipline ${disciplineSlug} not found.`);
  }

  const shapkaId = mapping?.adminShapkaId || settings.defaultShapkaId;
  const sportId = settings.adminSportId;
  const max = settings.adminMax || '5000';

  if (!shapkaId) warnings.push('Shapka ID is not set.');
  if (!sportId) warnings.push('Sport ID is not set.');
  // if (!max) warnings.push('Max is not set.'); // Max now defaults to 5000

  // 2. Fetch matches
  const matches = await prisma.tournamentMatch.findMany({
    where: { 
      tournamentId,
      id: matchIds ? { in: matchIds } : undefined
    },
    orderBy: { matchDate: 'asc' },
  });

  // 3. Fetch all team mappings for this discipline to avoid N+1
  const teamMappings = await prisma.teamMapping.findMany({
    where: { disciplineSlug },
  });

  const mappingMap = new Map(
    teamMappings.map((m) => [m.liquipediaName.toLowerCase(), m])
  );

  const readyMatches: FixtMatch[] = [];

  for (const match of matches) {
    const teamAName = match.teamAName;
    const teamBName = match.teamBName;

    if (!teamAName || !teamBName) {
      skippedMatches.push({
        matchId: match.matchId,
        reason: 'Missing team names',
        teams: `${teamAName} vs ${teamBName}`,
      });
      continue;
    }

    const mappingA = mappingMap.get(teamAName.toLowerCase());
    const mappingB = mappingMap.get(teamBName.toLowerCase());

    const platformIdA = mappingA?.platformId;
    const platformIdB = mappingB?.platformId;

    const isMappedA = platformIdA && (mappingA.status === 'auto_mapped' || mappingA.status === 'manual_mapped');
    const isMappedB = platformIdB && (mappingB.status === 'auto_mapped' || mappingB.status === 'manual_mapped');

    if (!isMappedA || !isMappedB) {
      skippedMatches.push({
        matchId: match.matchId,
        reason: 'Missing or unmapped team platform IDs',
        teams: `${teamAName} (${platformIdA || 'N/A'}) vs ${teamBName} (${platformIdB || 'N/A'})`,
      });
      continue;
    }

    if (!match.matchDate) {
      skippedMatches.push({
        matchId: match.matchId,
        reason: 'Missing match date',
        teams: `${teamAName} vs ${teamBName}`,
      });
      continue;
    }

    // Format date in Moscow
    const moscowDate = DateTime.fromJSDate(match.matchDate)
      .setZone('Europe/Moscow')
      .toFormat('dd.MM.yyyy HH:mm:ss');

    readyMatches.push({
      date: moscowDate,
      team1: parseInt(platformIdA!, 10),
      team2: parseInt(platformIdB!, 10),
    });
  }

  const payload: FixtPayload | null = (shapkaId && sportId && max && readyMatches.length > 0) ? {
    shapka: parseInt(shapkaId, 10),
    sport: parseInt(sportId, 10),
    max: parseInt(max, 10),
    match: readyMatches,
  } : null;

  return {
    payload,
    readyMatchesCount: readyMatches.length,
    skippedMatches,
    warnings,
  };
}
