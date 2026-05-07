import { NextResponse } from "next/server";
import { fetchDisciplinePortal } from "@/lib/liquipedia/portal";
import { prisma } from "@/lib/db";
import { isPlaceholderTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { disciplineSlug: string } }) {
  try {
    const data = await fetchDisciplinePortal(params.disciplineSlug);
    
    // Enrich with DB status
    const enrichedTournaments = await Promise.all(data.tournaments.map(async (t) => {
      const dbTournament = await prisma.tournament.findFirst({
        where: { sourceUrl: t.url },
        include: {
          matches: true
        }
      });

      if (!dbTournament) {
        return { ...t, dbStatus: 'not_loaded' as const };
      }

      const matches = (dbTournament as any).matches || [];
      if (matches.length === 0) {
        return { ...t, dbStatus: 'not_loaded' as const, dbId: dbTournament.id };
      }

      const allSynced = matches.every((m: any) => !!m.syncedAt);
      if (allSynced) {
        return { ...t, dbStatus: 'synced' as const, dbId: dbTournament.id };
      }

      const hasPlaceholders = matches.some((m: any) => 
        !m.teamAName || isPlaceholderTeam(m.teamAName) || 
        !m.teamBName || isPlaceholderTeam(m.teamBName)
      );

      if (hasPlaceholders) {
        return { ...t, dbStatus: 'announcements' as const, dbId: dbTournament.id };
      }

      return { ...t, dbStatus: 'ready' as const, dbId: dbTournament.id };
    }));

    return NextResponse.json({ ...data, tournaments: enrichedTournaments });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch portal data" }, { status: 500 });
  }
}
