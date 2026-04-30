import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateDota2Discipline } from "@/lib/disciplines";
import { fetchPageWikitext, fetchPageParsed, makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { normalizeDota2Tournament } from "@/lib/normalizers/dota2Tournament";

export const dynamic = "force-dynamic";

type Body = {
  pageId?: unknown;
  title?: unknown;
  pageUrl?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const pageId = typeof body.pageId === "number" ? body.pageId : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const pageUrl = typeof body.pageUrl === "string" && body.pageUrl.trim().length > 0
    ? body.pageUrl.trim()
    : makeLiquipediaPageUrl(title);

  if (!pageId && title.length < 2) {
    return NextResponse.json({ error: "Нужен pageId или title выбранной страницы" }, { status: 400 });
  }

  const discipline = await getOrCreateDota2Discipline();

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
    // Always fetch both wikitext and parsed HTML for match extraction
    const page = await fetchPageWikitext({ pageId, title });
    const pageTitle = page.title ?? title;
    const parsedHtml = await fetchPageParsed(pageTitle);

    const normalized = normalizeDota2Tournament({
      pageId: page.pageId ?? pageId,
      title: pageTitle,
      pageUrl: page.fullUrl ?? pageUrl,
      wikitext: page.wikitext,
      parsedHtml
    });

    await prisma.rawSnapshot.create({
      data: {
        tournamentImportId: tournamentImport.id,
        source: "liquipedia-mediawiki-api",
        pageId: page.pageId ?? pageId,
        pageTitle,
        rawJson: page.raw as Prisma.InputJsonValue,
        rawWikitext: page.wikitext
      }
    });

    const extractionStatus = normalized.status;

    const tournament = await prisma.tournament.upsert({
      where: {
        disciplineSlug_sourceTitle: {
          disciplineSlug: "dota2",
          sourceTitle: normalized.sourceTitle
        }
      },
      update: {
        sourcePageId: normalized.sourcePageId,
        sourceUrl: normalized.sourceUrl,
        name: normalized.name,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        location: normalized.location,
        region: normalized.region,
        organizer: normalized.organizer,
        prizePool: normalized.prizePool,
        formatText: normalized.formatText,
        status: normalized.tournamentStatus,
        extractionStatus,
        normalization: { warnings: normalized.warnings } as Prisma.InputJsonValue,
        lastImportId: tournamentImport.id
      },
      create: {
        sourcePageId: normalized.sourcePageId,
        sourceTitle: normalized.sourceTitle,
        sourceUrl: normalized.sourceUrl,
        name: normalized.name,
        disciplineSlug: "dota2",
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        location: normalized.location,
        region: normalized.region,
        organizer: normalized.organizer,
        prizePool: normalized.prizePool,
        formatText: normalized.formatText,
        status: normalized.tournamentStatus,
        extractionStatus,
        normalization: { warnings: normalized.warnings } as Prisma.InputJsonValue,
        lastImportId: tournamentImport.id
      }
    });

    await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id } });

    if (normalized.participants.length > 0) {
      await prisma.tournamentParticipant.createMany({
        data: normalized.participants.map((participant) => ({
          tournamentId: tournament.id,
          name: participant.name,
          seed: participant.seed,
          region: participant.region,
          status: participant.status,
          rawText: participant.rawText
        }))
      });
    }

    if (normalized.matches.length > 0) {
      await prisma.tournamentMatch.createMany({
        data: normalized.matches.map((match) => ({
          matchId: match.matchId ?? `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tournamentId: tournament.id,
          stage: match.stage,
          round: match.round,
          matchDate: match.matchDate,
          matchDateTime: match.matchDateTime,
          teamAId: match.teamAId,
          teamAName: match.teamAName,
          teamBId: match.teamBId,
          teamBName: match.teamBName,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          format: match.format,
          status: match.status,
          court: match.court,
          sourceUrl: match.sourceUrl,
          rawText: match.rawText
        }))
      });
    }

    // Auto-create TeamMapping entries for every unique team
    const teamNames = new Set<string>();
    for (const m of normalized.matches) {
      if (m.teamAName) teamNames.add(m.teamAName);
      if (m.teamBName) teamNames.add(m.teamBName);
    }
    for (const p of normalized.participants) {
      if (p.name) teamNames.add(p.name);
    }
    for (const name of teamNames) {
      await prisma.teamMapping.upsert({
        where: { liquipediaName: name },
        update: {},  // don't overwrite user's alias/platformId
        create: { liquipediaName: name }
      });
    }

    await prisma.tournamentImport.update({
      where: { id: tournamentImport.id },
      data: {
        status: extractionStatus,
        finishedAt: new Date()
      }
    });

    const fullTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
      include: { participants: true, matches: true, lastImport: true }
    });

    return NextResponse.json({ tournament: fullTournament, normalized });
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
