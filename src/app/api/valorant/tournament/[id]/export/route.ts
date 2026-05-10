import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchesToCsv, participantsToCsv, tournamentToMarkdown } from "@/lib/exporters/tournament";
import { dedupeTournamentMatches } from "@/lib/matches/dedupe";
import { generateInternalTeamId, isPlaceholderTeam } from "@/lib/teams";
import { getTeamMappingLookupKeys } from "@/lib/teams/canonicalize";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const type = searchParams.get("type") ?? "matches";

  const tournament = await prisma.tournament.findUnique({
    where: { id: id },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      matches: { orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }] }
    }
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const filenameBase = slugify(tournament.name);
  const matchesForExport = dedupeTournamentMatches(tournament.matches);

  // Fetch mappings to enhance data
  const teamNames = new Set<string>();
  matchesForExport.forEach(m => {
    if (m.teamAName) teamNames.add(m.teamAName);
    if (m.teamBName) teamNames.add(m.teamBName);
  });
  const mappings = await prisma.teamMapping.findMany({
    where: { liquipediaName: { in: Array.from(teamNames) } }
  });
  const mappingMap = new Map<string, (typeof mappings)[number]>();
  for (const mapping of mappings) {
    for (const key of getTeamMappingLookupKeys(mapping)) {
      if (!mappingMap.has(key)) mappingMap.set(key, mapping);
    }
  }

  const getTeamInfo = (name: string | null) => {
    if (!name || isPlaceholderTeam(name)) {
      const tbdM = mappingMap.get("TBD");
      return { 
        id: tbdM?.platformId || "tbd", 
        name: tbdM?.alias || "TBD" 
      };
    }
    const m = mappingMap.get(name) || mappingMap.get(name.toLowerCase());
    const id = m?.platformId || generateInternalTeamId(name);
    const displayName = m?.alias || name;
    return { id, name: displayName };
  };

  const formattedMatches = matchesForExport.map(m => {
    const teamA = getTeamInfo(m.teamAName);
    const teamB = getTeamInfo(m.teamBName);
    return {
      matchId: m.matchId,
      matchDateTime: m.matchDateTime,
      matchTimestamp: m.matchDate ? m.matchDate.getTime() : null,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      court: m.court
    };
  });

  if (format === "php") {
    const { buildFixtPayload } = await import("@/lib/adminUpload/buildFixtPayload");
    const { phpSerialize: serialize } = await import("@/lib/adminUpload/phpSerialize");
    const { payload } = await buildFixtPayload(id, "valorant");
    
    if (!payload) {
      return NextResponse.json({ error: "Could not build PHP payload. Check if Shapka ID and Sport ID are set and team mappings exist." }, { status: 400 });
    }

    const serialized = serialize(payload);
    return new Response(serialized, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.php.txt"`
      }
    });
  }

  if (format === "csv") {
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
