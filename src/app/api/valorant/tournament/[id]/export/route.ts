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

  const getTeamInfo = (name: string | null) => {
    if (!name || isPlaceholderTeam(name)) {
      const tbdM = mappingMap.get("TBD");
      return { 
        id: tbdM?.platformId || "tbd", 
        name: tbdM?.alias || "TBD" 
      };
    }
    const m = mappingMap.get(name);
    const id = m?.platformId || generateInternalTeamId(name);
    const displayName = m?.alias || name;
    return { id, name: displayName };
  };

  const formattedMatches = tournament.matches.map(m => {
    const teamA = getTeamInfo(m.teamAName);
    const teamB = getTeamInfo(m.teamBName);
    return {
      matchId: m.matchId,
      matchDateTime: m.matchDateTime,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      court: m.court
    };
  });

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
