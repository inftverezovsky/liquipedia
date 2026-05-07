import { notFound } from "next/navigation";
import LoadTournamentButton from "@/components/LoadTournamentButton";
import StatusBadge from "@/components/StatusBadge";
import TeamMappingPanel from "@/components/TeamMappingPanel";
import ExportPanel from "@/components/ExportPanel";
import TournamentAdminView from "@/components/TournamentAdminView";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { isPlaceholderTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      matches: { orderBy: [{ matchDate: "asc" }, { createdAt: "asc" }] },
      lastImport: {
        include: {
          rawSnapshots: {
            orderBy: { fetchedAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  if (!tournament) {
    notFound();
  }

  const teamNames = new Set<string>();
  for (const m of tournament.matches) {
    if (m.teamAName && !isPlaceholderTeam(m.teamAName)) teamNames.add(m.teamAName);
    if (m.teamBName && !isPlaceholderTeam(m.teamBName)) teamNames.add(m.teamBName);
  }
  for (const p of tournament.participants) {
    if (p.name && !isPlaceholderTeam(p.name)) teamNames.add(p.name);
  }
  teamNames.add("TBD");

  const mappings = await prisma.teamMapping.findMany({
    where: { disciplineSlug: "valorant", liquipediaName: { in: [...teamNames] } }
  });

  const mappingMap: Record<string, { alias: string | null; platformId: string | null; logoUrl: string | null }> = {};
  for (const m of mappings) {
    mappingMap[m.liquipediaName] = { alias: m.alias, platformId: m.platformId, logoUrl: m.logoUrl };
  }

  const rawSnapshot = tournament.lastImport?.rawSnapshots[0];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Valorant</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{tournament.name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <StatusBadge status={tournament.extractionStatus} />
              <div className="h-1 w-1 rounded-full bg-slate-300" />
              <a href={tournament.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-600 hover:text-slate-950 transition underline underline-offset-4 decoration-slate-200 hover:decoration-slate-950">
                Liquipedia Source
              </a>
              {tournament.lastImport?.finishedAt && (
                <>
                  <div className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="text-sm font-medium text-slate-500">Обновлено: {formatDateTime(tournament.lastImport.finishedAt)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadTournamentButton pageId={tournament.sourcePageId} title={tournament.sourceTitle} pageUrl={tournament.sourceUrl} disciplineSlug="valorant" />
          </div>
        </div>
      </section>

      <TournamentAdminView 
        tournament={tournament} 
        mappingMap={mappingMap} 
        disciplineSlug="valorant" 
      />

      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Маппинг команд</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Привяжите команды к вашей платформе.</p>
            </div>
            <div className="rounded-full bg-slate-100 p-2 group-open:rotate-180 transition-transform">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </summary>
          <div className="mt-8 border-t border-slate-100 pt-8">
            <TeamMappingPanel teamNames={[...teamNames]} initialMappings={mappings} disciplineSlug="valorant" />
          </div>
        </details>
      </section>

    </div>
  );
}
