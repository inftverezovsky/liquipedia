import { notFound } from "next/navigation";
import LoadTournamentButton from "@/components/LoadTournamentButton";
import StatusBadge from "@/components/StatusBadge";
import TeamMappingPanel from "@/components/TeamMappingPanel";
import MatchList from "@/components/MatchList";
import ExportPanel from "@/components/ExportPanel";
import AdminUploadPanel from "@/components/AdminUploadPanel";
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
          rawSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 }
        }
      }
    }
  });

  if (!tournament) notFound();

  // Get team mappings
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
    where: { disciplineSlug: "dota2", liquipediaName: { in: [...teamNames] } }
  });

  const mappingMap: Record<string, { alias: string | null; platformId: string | null; logoUrl: string | null }> = {};
  for (const m of mappings) {
    mappingMap[m.liquipediaName] = { alias: m.alias, platformId: m.platformId, logoUrl: m.logoUrl };
  }

  const rawSnapshot = tournament.lastImport?.rawSnapshots[0];

  return (
    <div className="space-y-8 animate-in">
      {/* Header section */}
      <section className="rounded-3xl border border-slate-200 bg-white p-8 lg:p-12 shadow-sm">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-500/5 backdrop-blur-sm px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-slate-600 border border-slate-200/50">
                Dota 2
              </span>
              <StatusBadge status={tournament.extractionStatus} />
            </div>
            <h1 className="mt-4 text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
              {tournament.name}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-6 text-sm font-normal text-slate-500">
              <a href={tournament.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-slate-900 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                Liquipedia
              </a>
              {tournament.lastImport?.finishedAt && (
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Sync: {formatDateTime(tournament.lastImport.finishedAt)}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-3">
            <LoadTournamentButton 
              pageId={tournament.sourcePageId} 
              title={tournament.sourceTitle} 
              pageUrl={tournament.sourceUrl} 
              disciplineSlug="dota2" 
              initialTournamentId={tournament.id}
              force={true}
            />
          </div>
        </div>
      </section>

      <TournamentAdminView 
        tournament={tournament} 
        mappingMap={mappingMap} 
        disciplineSlug="dota2" 
      />

      {/* Team Mapping */}
      <section className="premium-card p-8">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <div>
              <h2 className="text-2xl font-medium text-slate-900">Маппинг команд</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Свяжите участников с вашей платформой для корректного экспорта.</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-2 group-open:rotate-180 transition-transform">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </summary>
          <div className="mt-8 border-t border-slate-100 pt-8">
            <TeamMappingPanel teamNames={[...teamNames]} initialMappings={mappings} disciplineSlug="dota2" />
          </div>
        </details>
      </section>

    </div>
  );
}
