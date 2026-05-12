import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCounterStrikeDiscipline } from "@/lib/disciplines";
import { makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { normalizeCounterStrikeTournament } from "@/lib/normalizers/counterstrikeTournament";
import { importTournamentRecursive } from "@/lib/liquipedia/importer";
import { runHltvScript } from "@/lib/hltv/scraper";
import { classifyParserError } from "@/lib/parserErrors";
import { dedupeTournamentMatches } from "@/lib/matches/dedupe";
import { getTeamMappingLookupKeys } from "@/lib/teams/canonicalize";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for long scraping with retries

type Body = {
  pageId?: unknown;
  title?: unknown;
  pageUrl?: unknown;
  source?: "liquipedia" | "hltv";
  force?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const source = body.source || "liquipedia";
  const pageId = typeof body.pageId === "number" ? body.pageId : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const pageUrl = typeof body.pageUrl === "string" && body.pageUrl.trim().length > 0
    ? body.pageUrl.trim()
    : (source === 'hltv' ? "" : makeLiquipediaPageUrl(title, "counterstrike"));

  if (!pageId && title.length < 2) {
    return NextResponse.json({ error: "Нужен pageId или title выбранной страницы" }, { status: 400 });
  }

  const discipline = await getOrCreateCounterStrikeDiscipline();

  // If source is HLTV, we handle it differently (skip Liquipedia recursive import)
  if (source === "hltv") {
    let hltvData: { ok?: boolean; error?: string; errorClass?: string; matches?: any[] } = { ok: false };

    // 1. Create/Update tournament
    const tournament = await prisma.tournament.upsert({
      where: { disciplineSlug_sourceTitle: { disciplineSlug: "counterstrike", sourceTitle: title } },
      create: {
        name: title,
        sourceTitle: title,
        sourceUrl: pageUrl,
        disciplineSlug: "counterstrike",
        status: "ongoing",
        extractionStatus: "SUCCESS"
      },
      update: {
        sourceUrl: pageUrl,
        updatedAt: new Date()
      }
    });

    // 2. Extract HLTV Event ID and fetch matches
    let hltvEventId = "";
    const idMatch = pageUrl.match(/\/events\/(\d+)\//);
    if (idMatch) {
      hltvEventId = idMatch[1];
    } else {
      // Fallback for different URL formats
      const parts = pageUrl.split('/');
      const eventIdx = parts.indexOf('events');
      if (eventIdx !== -1 && parts[eventIdx + 1]) {
        hltvEventId = parts[eventIdx + 1];
      }
    }

    if (hltvEventId) {
      hltvData = await runHltvScript('event', hltvEventId, { noCache: !!body.force }).catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown HLTV scraper error",
        errorClass: classifyParserError({ message: err instanceof Error ? err.message : String(err) }),
      }));

      if (hltvData.ok && hltvData.matches) {
        // EXPERT OPTIMIZATION: Batch process all matches and participants to prevent DB connection drops
        const hltvMatches = dedupeTournamentMatches(hltvData.matches.map((m: any) => ({
          ...m,
          matchId: `hltv-${m.id}`,
          teamAName: m.team1,
          teamBName: m.team2,
          matchDate: m.unix_time ? new Date(m.unix_time * 1000) : null,
        })));
        
        // 1. Batch Match Upserts using transaction
        const matchUpserts = hltvMatches.map((m: any) => {
          const matchDate = m.matchDate ? new Date(m.matchDate) : null;
          return prisma.tournamentMatch.upsert({
            where: { matchId: m.matchId },
            create: {
              matchId: m.matchId,
              tournamentId: tournament.id,
              teamAName: m.team1,
              teamBName: m.team2,
              matchDate,
              sourceUrl: `https://www.hltv.org/matches/${m.id}/match`,
              status: "upcoming"
            },
            update: {
              teamAName: m.team1,
              teamBName: m.team2,
              matchDate
            }
          });
        });

        // 2. Prepare unique participants
        const uniqueTeams = new Set<string>();
        for (const m of hltvMatches) {
          if (m.team1 && m.team1 !== 'TBD') uniqueTeams.add(m.team1);
          if (m.team2 && m.team2 !== 'TBD') uniqueTeams.add(m.team2);
        }

        const [existingParticipants, teamMappings] = await Promise.all([
          body.force
            ? Promise.resolve([])
            : prisma.tournamentParticipant.findMany({
                where: { tournamentId: tournament.id },
                select: { name: true, platformId: true, logoUrl: true, rawText: true }
              }),
          prisma.teamMapping.findMany({
            where: { disciplineSlug: "counterstrike" }
          })
        ]);
        const existingParticipantMap = new Map(existingParticipants.map((p) => [p.name.toLowerCase(), p]));
        const mappingLookup = new Map<string, (typeof teamMappings)[number]>();
        for (const mapping of teamMappings) {
          mappingLookup.set(mapping.liquipediaName.toLowerCase(), mapping);
        }
        for (const mapping of teamMappings) {
          for (const key of getTeamMappingLookupKeys(mapping)) {
            if (key && !mappingLookup.has(key.toLowerCase())) {
              mappingLookup.set(key.toLowerCase(), mapping);
            }
          }
        }

        const participantsToInsert = Array.from(uniqueTeams)
          .sort((a, b) => a.localeCompare(b))
          .map(name => {
            const existing = existingParticipantMap.get(name.toLowerCase());
            const mapping = mappingLookup.get(name.toLowerCase());
            return {
            tournamentId: tournament.id,
            name,
            platformId: existing?.platformId || mapping?.platformId || null,
            logoUrl: existing?.logoUrl || mapping?.logoUrl || null,
            rawText: existing?.rawText || null,
          };
        });

        // Replace HLTV participants with the latest event teams. Old bad OCR aliases
        // like "G" for "G2" must not remain forever in the mapping UI.
        try {
          const participantRefresh = [
            prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } }),
            ...(participantsToInsert.length > 0
              ? [prisma.tournamentParticipant.createMany({ data: participantsToInsert })]
              : [])
          ];

          if (body.force) {
            await prisma.$transaction([
              prisma.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id } }),
              ...participantRefresh,
              ...matchUpserts
            ]);
          } else {
            await prisma.$transaction([
              ...matchUpserts,
              ...participantRefresh
            ]);
          }
        } catch (e) {
          console.error(`[HLTV Import] Database batch save error:`, e);
          throw new Error("Ошибка при сохранении матчей в базу данных.");
        }
      } else if (hltvData.error) {
        console.error(`[HLTV Import] Fetching failed: ${hltvData.error}`);
      }
    } else {
      hltvData = { ok: false, error: "Не удалось определить HLTV event id из URL" };
    }

    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true, lastImport: true }
    });

    return NextResponse.json({
      tournament: fullTournament ? { ...fullTournament, matches: dedupeTournamentMatches(fullTournament.matches) } : null,
      normalized: { status: hltvData?.ok ? "SUCCESS" : "PARTIAL", error: hltvData?.error } 
    });
  }

  const tournamentImport = await prisma.tournamentImport.create({
    data: {
      disciplineId: discipline.id,
      pageId,
      pageTitle: title,
      pageUrl,
      status: "PENDING"
    }
  });

  try {
    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/counterstrike/api.php";
    
    const importResult = await importTournamentRecursive({
      disciplineId: discipline.id,
      disciplineSlug: "counterstrike",
      apiUrl,
      pageId,
      title,
      pageUrl,
      normalizer: normalizeCounterStrikeTournament,
      importRecordId: tournamentImport.id,
      force: body.force
    });
    const { tournament, normalized } = importResult;

    await prisma.tournamentImport.update({
      where: { id: tournamentImport.id },
      data: {
        status: normalized.status,
        finishedAt: new Date()
      }
    });

    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true, lastImport: true }
    });

    return NextResponse.json({
      tournament: fullTournament ? { ...fullTournament, matches: dedupeTournamentMatches(fullTournament.matches) } : null,
      normalized,
      cacheHit: importResult.cacheHit,
      cacheLayer: importResult.cacheLayer,
      stale: importResult.stale,
      warning: importResult.warning,
      qualityScore: importResult.qualityScore,
      requestStats: importResult.requestStats,
      sourceBreakdown: importResult.sourceBreakdown,
    });
  } catch (error) {
    console.error(error);
    await prisma.tournamentImport.update({
      where: { id: tournamentImport.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown import error"
      }
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить турнир" },
      { status: 500 }
    );
  }
}
