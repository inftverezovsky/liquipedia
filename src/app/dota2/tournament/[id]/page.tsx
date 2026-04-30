import { notFound } from "next/navigation";
import LoadTournamentButton from "@/components/LoadTournamentButton";
import StatusBadge from "@/components/StatusBadge";
import TeamMappingPanel from "@/components/TeamMappingPanel";
import MatchList from "@/components/MatchList";
import TournamentPlatformIdPanel from "@/components/TournamentPlatformIdPanel";
import { prisma } from "@/lib/db";
import { formatDateTime, formatShortDate } from "@/lib/format";
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

  // Get team mappings for all teams in this tournament
  const teamNames = new Set<string>();
  for (const m of tournament.matches) {
    if (m.teamAName && !isPlaceholderTeam(m.teamAName)) teamNames.add(m.teamAName);
    if (m.teamBName && !isPlaceholderTeam(m.teamBName)) teamNames.add(m.teamBName);
  }
  for (const p of tournament.participants) {
    if (p.name && !isPlaceholderTeam(p.name)) teamNames.add(p.name);
  }
  
  // Add TBD explicitly so it can be mapped once for all placeholders
  teamNames.add("TBD");

  const mappings = await prisma.teamMapping.findMany({
    where: { liquipediaName: { in: [...teamNames] } }
  });

  const mappingMap: Record<string, { alias: string | null; platformId: string | null }> = {};
  for (const m of mappings) {
    mappingMap[m.liquipediaName] = { alias: m.alias, platformId: m.platformId };
  }

  const rawSnapshot = tournament.lastImport?.rawSnapshots[0];
  const warnings = Array.isArray((tournament.normalization as { warnings?: unknown[] } | null)?.warnings)
    ? ((tournament.normalization as { warnings?: string[] }).warnings ?? [])
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Dota 2 tournament</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{tournament.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={tournament.extractionStatus} />
              <a href={tournament.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-700 underline underline-offset-4">
                Liquipedia source
              </a>
              {tournament.lastImport?.finishedAt ? (
                <span className="text-sm text-slate-500">Загружено: {formatDateTime(tournament.lastImport.finishedAt)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/api/dota2/tournament/${tournament.id}/export?format=json`}>JSON</a>
            <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/api/dota2/tournament/${tournament.id}/export?format=csv&type=matches`}>CSV матчи</a>
            <LoadTournamentButton pageId={tournament.sourcePageId} title={tournament.sourceTitle} pageUrl={tournament.sourceUrl} />
          </div>
        </div>
      </section>



      {/* Matches — simplified format */}
      <section className="rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Матчи</h2>
          {tournament.matches.length > 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {tournament.matches.length}
            </span>
          )}
        </div>
        <MatchList matches={tournament.matches} mappings={mappingMap} />
        <TournamentPlatformIdPanel tournamentId={tournament.id} initialPlatformId={tournament.platformId} />
      </section>

      {/* Advanced Settings: Team Mapping */}
      <section className="rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Настройки маппинга команд (Advanced)</h2>
              <p className="mt-1 text-sm text-slate-500 group-open:block hidden">Привяжите канонические имена и Platform ID для внешних систем.</p>
            </div>
            <span className="text-slate-400 group-open:rotate-180 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </span>
          </summary>
          <div className="mt-6 border-t border-slate-200 pt-6">
            <TeamMappingPanel teamNames={[...teamNames]} initialMappings={mappings} />
          </div>
        </details>
      </section>

      {/* Raw debug */}
      <section className="rounded-3xl bg-slate-950 p-6 text-white ring-1 ring-slate-900">
        <h2 className="text-lg font-semibold">Raw snapshot / debug</h2>
        <details className="mt-4 rounded-2xl bg-white/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Показать raw wikitext</summary>
          <pre className="mt-4 max-h-[520px] overflow-auto text-xs text-slate-200">{rawSnapshot?.rawWikitext ?? "Нет raw wikitext"}</pre>
        </details>
      </section>
    </div>
  );
}


