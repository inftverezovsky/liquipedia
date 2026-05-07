import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchesToCsv, participantsToCsv, tournamentToMarkdown } from "@/lib/exporters/tournament";
import { generateInternalTeamId, isPlaceholderTeam } from "@/lib/teams";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const type = searchParams.get("type") ?? "matches";

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      matches: { orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }] }
    }
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const filenameBase = slugify(tournament.name);

  // Fetch mappings to enhance data
  const teamNames = new Set<string>();
  tournament.matches.forEach(m => {
    if (m.teamAName) teamNames.add(m.teamAName);
    if (m.teamBName) teamNames.add(m.teamBName);
  });
  const mappings = await prisma.teamMapping.findMany({
    where: { liquipediaName: { in: Array.from(teamNames) } }
  });
  const mappingMap = new Map(mappings.map(m => [m.liquipediaName, m]));

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
    
    // If mapped, platformId should be used.
    // If not mapped, platformId is null, and id becomes internalTeamId.
    const internalId = generateInternalTeamId(name);
    const platformId = m?.platformId || null;
    
    return { 
      id: platformId || internalId, 
      name: name, // leave Liquipedia name
      canonicalName: m?.canonicalName || null,
      internalId,
      mappingConfidence: m?.confidenceScore || null,
      platformId
    };
  };

  const formattedMatches = tournament.matches.map(m => {
    const teamA = getTeamInfo(m.teamAName, 'A');
    const teamB = getTeamInfo(m.teamBName, 'B');
    return {
      matchId: m.matchId,
      matchDateTime: m.matchDateTime,
      matchTimestamp: m.matchDate ? m.matchDate.getTime() : null,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      court: m.court,
      // Extra fields
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

  if (format === "csv") {
    // Note: exporters might need update but for now using the tournament object with injected formatted data
    const csv = type === "participants" 
      ? participantsToCsv({ ...tournament, matches: formattedMatches as any }) 
      : matchesToCsv({ ...tournament, matches: formattedMatches as any });
    
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}-${type}.csv"`
      }
    });
  }

  if (format === "markdown" || format === "md") {
    const markdown = tournamentToMarkdown({ ...tournament, matches: formattedMatches as any });
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.md"`
      }
    });
  }

  return NextResponse.json({ 
    id: tournament.id,
    name: tournament.name,
    platformId: tournament.platformId,
    startDate: tournament.startDate,
    endDate: tournament.endDate,
    startTimestamp: tournament.startDate ? tournament.startDate.getTime() : null,
    endTimestamp: tournament.endDate ? tournament.endDate.getTime() : null,
    matches: formattedMatches 
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tournament";
}
