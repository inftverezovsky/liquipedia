import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { matchIds, disciplineSlug } = await request.json();

    if (!matchIds || !Array.isArray(matchIds)) {
      return NextResponse.json({ error: "matchIds array is required" }, { status: 400 });
    }

    // 1. Fetch matches with their tournament data
    const matches = await prisma.tournamentMatch.findMany({
      where: { id: { in: matchIds } },
      include: { tournament: true },
    });

    // 2. Fetch all unique team names from these matches to get their platform IDs
    const teamNames = new Set<string>();
    matches.forEach(m => {
      if (m.teamAName) teamNames.add(m.teamAName);
      if (m.teamBName) teamNames.add(m.teamBName);
    });

    const mappings = await prisma.teamMapping.findMany({
      where: {
        disciplineSlug,
        liquipediaName: { in: Array.from(teamNames) }
      }
    });

    const mappingMap = new Map(mappings.map(m => [m.liquipediaName, m]));

    // 3. Get target URL from settings
    const targetUrlSetting = await prisma.globalSettings.findUnique({ where: { key: "external_platform_url" } });
    const targetApiKeySetting = await prisma.globalSettings.findUnique({ where: { key: "external_platform_api_key" } });

    if (!targetUrlSetting?.value) {
      return NextResponse.json({ error: "External Platform URL not configured in settings" }, { status: 400 });
    }

    // 4. Prepare data for the external platform
    const payload = matches.map(m => {
      const teamA = mappingMap.get(m.teamAName || "");
      const teamB = mappingMap.get(m.teamBName || "");

      return {
        externalId: m.id,
        liquipediaMatchId: m.matchId,
        tournament: {
          name: m.tournament.name,
          platformId: m.tournament.platformId,
        },
        discipline: disciplineSlug,
        matchDate: m.matchDate,
        teamA: {
          name: m.teamAName,
          platformId: teamA?.platformId || null,
          alias: teamA?.alias || null,
        },
        teamB: {
          name: m.teamBName,
          platformId: teamB?.platformId || null,
          alias: teamB?.alias || null,
        },
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        status: m.status,
        format: m.format,
        stage: m.stage,
        round: m.round,
      };
    });

    // 5. Send to external platform
    const response = await fetch(targetUrlSetting.value, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${targetApiKeySetting?.value || ""}`,
      },
      body: JSON.stringify({ matches: payload }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`External platform returned error: ${errorText}`);
    }

    // 6. Mark matches as synced
    await prisma.tournamentMatch.updateMany({
      where: { id: { in: matchIds } },
      data: { syncedAt: new Date() },
    });

    return NextResponse.json({ success: true, count: matches.length });
  } catch (error: any) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
