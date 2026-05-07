import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDota2Discipline } from "@/lib/disciplines";
import { makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { normalizeDota2Tournament } from "@/lib/normalizers/dota2Tournament";
import { importTournamentRecursive } from "@/lib/liquipedia/importer";

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
    : makeLiquipediaPageUrl(title, "dota2");

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
    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/dota2/api.php";
    
    const { tournament, normalized } = await importTournamentRecursive({
      disciplineId: discipline.id,
      disciplineSlug: "dota2",
      apiUrl,
      pageId,
      title,
      pageUrl,
      normalizer: normalizeDota2Tournament,
      importRecordId: tournamentImport.id
    });

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

    if (fullTournament) {
      const { ensureTeamMappingsForTournament } = await import("@/lib/teams/mapping");
      await ensureTeamMappingsForTournament(fullTournament.id, "dota2");
    }

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
