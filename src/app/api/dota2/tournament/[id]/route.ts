import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      participants: true,
      matches: true,
      lastImport: {
        include: { rawSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 } }
      }
    }
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Deduplicate matches (in case of double imports or buggy parsing in the past)
  const uniqueMatches = new Map();
  tournament.matches.forEach(m => {
    const tA = m.teamAName?.trim().toLowerCase() || "";
    const tB = m.teamBName?.trim().toLowerCase() || "";
    const [team1, team2] = [tA, tB].sort();
    const dateTs = m.matchDate ? Math.floor(new Date(m.matchDate).getTime() / 60000) : 0;
    const key = `${team1}|${team2}|${dateTs}`;
    
    if (!uniqueMatches.has(key)) {
      uniqueMatches.set(key, m);
    } else {
      const existing = uniqueMatches.get(key);
      const isNewBetter = (!existing.platformId && m.platformId) || (m.matchId && m.matchId.startsWith('match_') && !existing.matchId.startsWith('match_'));
      if (isNewBetter) {
        uniqueMatches.set(key, m);
      }
    }
  });

  return NextResponse.json({ 
    tournament: {
      ...tournament,
      matches: Array.from(uniqueMatches.values())
    } 
  });
}
