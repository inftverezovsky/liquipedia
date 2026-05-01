"use client";

import { useState, useMemo } from "react";
import { isPlaceholderTeam } from "@/lib/teams";
import { SyncMatchesButton } from "./SyncMatchesButton";

type Match = {
  id: string;
  matchId: string;
  matchDate: Date | string | null;
  matchDateTime: string | null;
  teamAName: string | null;
  teamBName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  stage: string | null;
  round: string | null;
  status: string | null;
  syncedAt: Date | string | null;
  rawText: string | null;
};

type MappingInfo = { alias: string | null; platformId: string | null; logoUrl?: string | null };

function getMatchTimestamp(match: Match): number | null {
  if (match.matchDate) {
    const d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

export default function MatchList({
  matches,
  mappings,
  disciplineSlug
}: {
  matches: Match[];
  mappings: Record<string, MappingInfo>;
  disciplineSlug: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      const tsA = getMatchTimestamp(a) || Infinity;
      const tsB = getMatchTimestamp(b) || Infinity;
      if (tsA !== tsB) return tsA - tsB;
      
      // Secondary stable sort by ID
      return a.id.localeCompare(b.id);
    });
  }, [matches]);

  const now = Date.now();
  const upcomingMatches = useMemo(() => sortedMatches.filter((m) => {
    const ts = getMatchTimestamp(m);
    if (!ts) return true;
    return ts > now;
  }), [sortedMatches, now]);

  const pastCount = matches.length - upcomingMatches.length;
  const displayMatches = showAll ? sortedMatches : upcomingMatches;

  const allSelected = displayMatches.length > 0 && displayMatches.every(m => selectedIds.has(m.id));

  function toggleAll() {
    if (allSelected) {
      const newIds = new Set(selectedIds);
      displayMatches.forEach(m => newIds.delete(m.id));
      setSelectedIds(newIds);
    } else {
      const newIds = new Set(selectedIds);
      displayMatches.forEach(m => newIds.add(m.id));
      setSelectedIds(newIds);
    }
  }

  function toggleOne(id: string) {
    const newIds = new Set(selectedIds);
    if (newIds.has(id)) newIds.delete(id);
    else newIds.add(id);
    setSelectedIds(newIds);
  }

  function formatMoscowDate(match: Match): string {
    let d: Date | null = null;
    if (match.matchDate) {
      d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
      if (isNaN(d.getTime())) d = null;
    }
    if (!d && match.matchDateTime) {
      const cleaned = match.matchDateTime.replace(/\s*-\s*/, " ").replace(/\s+[A-Z]{2,5}$/, "");
      const parsed = new Date(cleaned + " UTC");
      if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (!d) return "—";
    const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const dd = String(msk.getUTCDate()).padStart(2, "0");
    const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = msk.getUTCFullYear();
    const hh = String(msk.getUTCHours()).padStart(2, "0");
    const min = String(msk.getUTCMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
  }

  function isMatchReady(match: Match): boolean {
    const isTbdA = !match.teamAName || isPlaceholderTeam(match.teamAName);
    const isTbdB = !match.teamBName || isPlaceholderTeam(match.teamBName);
    
    const pidA = isTbdA ? "tbd" : mappings[match.teamAName!]?.platformId;
    const pidB = isTbdB ? "tbd" : mappings[match.teamBName!]?.platformId;
    
    return !!(pidA && pidB);
  }

  function teamLabel(name: string | null): React.ReactNode {
    const isTbd = !name || isPlaceholderTeam(name);
    const effectiveName = isTbd ? "TBD" : name;
    const m = mappings[effectiveName];
    const alias = m?.alias || "—";
    const pid = m?.platformId || "";

    return (
      <span className="truncate">
        {effectiveName} <span className="text-slate-400 font-normal">({alias})</span> <span className={`font-bold ${pid ? "text-blue-600" : "text-red-500"}`}>{pid || "NO ID"}</span>
      </span>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-6 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-2">
          {pastCount > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                showAll ? "bg-slate-200 text-slate-700" : "bg-slate-950 text-white"
              }`}
            >
              {showAll ? "Скрыть прошедшие" : `Показать все (+${pastCount})`}
            </button>
          )}
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
            {showAll ? `Всего: ${matches.length}` : `Предстоящие: ${upcomingMatches.length}`}
          </span>
        </div>

        <SyncMatchesButton 
          selectedIds={Array.from(selectedIds)} 
          disciplineSlug={disciplineSlug} 
          onSuccess={() => window.location.reload()}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        {displayMatches.length > 0 && (
          <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded-md border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            Выбрать все на странице
          </label>
        )}
      </div>

      {displayMatches.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-500">
            Предстоящих матчей не найдено.
          </p>
          <button onClick={() => setShowAll(true)} className="mt-2 text-sm font-semibold text-slate-950 underline">
            Показать архив ({pastCount})
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          {displayMatches.map((match) => {
            const ts = getMatchTimestamp(match);
            const isPast = ts ? ts <= now : false;
            const isConflict = match.rawText?.includes("CONFLICT");
            const isReady = isMatchReady(match);
            const isSynced = !!match.syncedAt;
            
            return (
              <div
                key={match.id}
                className={`group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:shadow-soft ${
                  isPast ? "opacity-60" : ""
                } ${isConflict ? "ring-2 ring-orange-400 border-transparent" : ""} ${isSynced ? "bg-slate-50/50" : ""}`}
              >
                <div className="flex flex-1 items-center gap-4 min-w-0">
                  <div className="flex flex-col shrink-0 w-[110px]">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isReady ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500" title="Готов к синхронизации" />
                      ) : (
                        <div className="h-1.5 w-1.5 rounded-full bg-red-400" title="Нет ID команд" />
                      )}
                      {isSynced && (
                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter bg-blue-50 px-1 rounded">Synced</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      {match.matchId.slice(0, 12)}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{formatMoscowDate(match)}</span>
                  </div>
                  
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0 font-semibold">{teamLabel(match.teamAName)}</div>
                    <div className="shrink-0 text-slate-300 text-xs px-2">VS</div>
                    <div className="flex-1 min-w-0 font-semibold">{teamLabel(match.teamBName)}</div>
                  </div>

                  {(match.scoreA != null || match.scoreB != null) && (
                    <div className={`shrink-0 rounded-lg px-3 py-1 text-sm font-bold ${isConflict ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-700"}`}>
                      {match.scoreA ?? "—"}:{match.scoreB ?? "—"}
                    </div>
                  )}
                  
                  {isConflict && (
                    <div className="shrink-0" title="Данные на Liquipedia изменились!">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </span>
                    </div>
                  )}
                </div>

                <input
                  type="checkbox"
                  checked={selectedIds.has(match.id)}
                  onChange={() => toggleOne(match.id)}
                  className="h-5 w-5 shrink-0 rounded-lg border-slate-300 text-slate-900 focus:ring-slate-900 transition-all group-hover:scale-110"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

