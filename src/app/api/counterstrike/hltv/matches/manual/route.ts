import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { matches: rawMatches } = await req.json();

    if (!Array.isArray(rawMatches)) {
      return NextResponse.json({ ok: false, error: "Invalid matches data" }, { status: 400 });
    }

    // Get all team mappings for Counter-Strike to map names to platform IDs
    const mappings = await prisma.teamMapping.findMany({
      where: { disciplineSlug: "counterstrike" }
    });

    const mappingMap = new Map(mappings.map(m => [m.liquipediaName.toLowerCase(), m]));

    const findBestMatch = (name: string) => {
      if (!name) return null;
      const lowerName = name.toLowerCase();
      // 1. Exact match
      if (mappingMap.has(lowerName)) return mappingMap.get(lowerName);
      
      // 2. Fuzzy match: check if database name is inside OCR name or vice versa
      // This helps with "EB Tricked" matching "Tricked"
      for (const m of mappings) {
        const dbName = m.liquipediaName.toLowerCase();
        if (lowerName.includes(dbName) || dbName.includes(lowerName)) {
          if (dbName.length > 3) return m; // Only match if name is long enough
        }
      }
      return null;
    };

    const matches = rawMatches.map((m: any) => {
      const name1 = (typeof m.team1 === 'object' ? m.team1?.name : m.team1) || "TBD";
      const name2 = (typeof m.team2 === 'object' ? m.team2?.name : m.team2) || "TBD";
      
      const teamA = findBestMatch(name1);
      const teamB = findBestMatch(name2);

      // Format date
      let dateStr = m.date || "Unknown";
      if (m.unix_time) {
        const date = new Date(parseInt(m.unix_time) * 1000);
        dateStr = date.toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Europe/Moscow'
        }).replace(',', '');
      }

      return {
        id: m.id || Math.random().toString(36).substr(2, 9),
        tournament: m.tournament || "Unknown",
        team1: {
          name: name1,
          platformId: teamA?.platformId || null,
        },
        team2: {
          name: name2,
          platformId: teamB?.platformId || null,
        },
        date: dateStr,
        isReady: !!teamA?.platformId && !!teamB?.platformId
      };
    });

    return NextResponse.json({ ok: true, matches });
  } catch (error: any) {
    console.error('[HLTV Manual API] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
