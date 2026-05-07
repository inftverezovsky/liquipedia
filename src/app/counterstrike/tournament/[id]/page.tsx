import { notFound } from "next/navigation";
import LoadTournamentButton from "@/components/LoadTournamentButton";
import StatusBadge from "@/components/StatusBadge";
import TeamMappingPanel from "@/components/TeamMappingPanel";
import MatchList from "@/components/MatchList";
import TournamentPlatformIdPanel from "@/components/TournamentPlatformIdPanel";
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

  // Get team mappings for all teams in this tournament
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
    where: { 
      disciplineSlug: "counterstrike",
      liquipediaName: { in: [...teamNames] } 
    }
  });

  const mappingMap: Record<string, { alias: string | null; platformId: string | null; logoUrl: string | null }> = {};
  for (const m of mappings) {
    mappingMap[m.liquipediaName] = { 
      alias: m.alias, 
      platformId: m.platformId,
      logoUrl: m.logoUrl 
    };
  }

  const rawSnapshot = tournament.lastImport?.rawSnapshots[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Counter-Strike</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{tournament.name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <StatusBadge status={tournament.extractionStatus} />
              <div className="h-1 w-1 rounded-full bg-slate-300" />
              <a href={tournament.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-600 hover:text-slate-950 transition underline underline-offset-4 decoration-slate-200 hover:decoration-slate-950">
                Liquipedia Source
              </a>
              {tournament.lastImport?.finishedAt ? (
                <>
                  <div className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className="text-sm font-medium text-slate-500">Обновлено: {formatDateTime(tournament.lastImport.finishedAt)}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadTournamentButton pageId={tournament.sourcePageId} title={tournament.sourceTitle} pageUrl={tournament.sourceUrl} disciplineSlug="counterstrike" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Matches */}
          <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-xl font-bold text-slate-950">Расписание и результаты</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {tournament.matches.length}
              </span>
            </div>
            <MatchList 
              matches={tournament.matches.map(m => ({
                ...m,
                lpNumericalId: m.lpNumericalId ? m.lpNumericalId.toString() : null
              }))} 
              mappings={mappingMap} 
              disciplineSlug="counterstrike" 
            />
          </section>
        </div>

        <div className="space-y-6">
          {/* Platform Settings */}
          <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-slate-950 mb-4">Настройки платформы</h2>
            <TournamentPlatformIdPanel tournamentId={tournament.id} initialPlatformId={tournament.platformId} disciplineSlug="counterstrike" />
          </section>

          {/* Export */}
          <section className="rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Экспорт данных</h2>
            <div className="grid grid-cols-2 gap-2">
              <a className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition" href={`/api/counterstrike/tournament/${tournament.id}/export?format=json`}>JSON</a>
              <a className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition" href={`/api/counterstrike/tournament/${tournament.id}/export?format=csv&type=matches`}>CSV</a>
            </div>
          </section>
        </div>
      </div>

      {/* Advanced Settings: Team Mapping */}
      <section className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between list-none">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Маппинг команд</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Привяжите команды к вашей платформе. Эти настройки сохраняются навсегда для всех турниров.</p>
            </div>
            <div className="rounded-full bg-slate-100 p-2 group-open:rotate-180 transition-transform">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
          </summary>
          <div className="mt-8 border-t border-slate-100 pt-8">
            <TeamMappingPanel teamNames={[...teamNames]} initialMappings={mappings} disciplineSlug="counterstrike" />
          </div>
        </details>
      </section>

      {/* Debug */}
      <section className="rounded-3xl bg-slate-950 p-8 text-white">
        <h2 className="text-lg font-bold mb-4">Техническая информация</h2>
        <details className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-400 hover:text-white transition">Показать Raw Wikitext</summary>
          <pre className="mt-6 max-h-[500px] overflow-auto text-[10px] leading-relaxed text-slate-400 font-mono scrollbar-hide">{rawSnapshot?.rawWikitext ?? "Нет данных"}</pre>
        </details>
      </section>
    </div>
  );
}
