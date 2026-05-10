import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateValorantDiscipline } from "@/lib/disciplines";
import { makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { normalizeValorantTournament } from "@/lib/normalizers/valorantTournament";
import { importTournamentRecursive } from "@/lib/liquipedia/importer";
import { dedupeTournamentMatches } from "@/lib/matches/dedupe";

export const dynamic = "force-dynamic";

type Body = {
  pageId?: unknown;
  title?: unknown;
  pageUrl?: unknown;
  force?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const pageId = typeof body.pageId === "number" ? body.pageId : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const pageUrl = typeof body.pageUrl === "string" && body.pageUrl.trim().length > 0
    ? body.pageUrl.trim()
    : makeLiquipediaPageUrl(title, "valorant");

  if (!pageId && title.length < 2) {
    return NextResponse.json({ error: "Нужен pageId или title выбранной страницы" }, { status: 400 });
  }

  const discipline = await getOrCreateValorantDiscipline();

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
    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/valorant/api.php";
    
    const importResult = await importTournamentRecursive({
      disciplineId: discipline.id,
      disciplineSlug: "valorant",
      apiUrl,
      pageId,
      title,
      pageUrl,
      normalizer: normalizeValorantTournament,
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
