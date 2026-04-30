"use client";

import { useState, useMemo } from "react";
import { isPlaceholderTeam } from "@/lib/teams";

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
};

type MappingInfo = { alias: string | null; platformId: string | null };

function getMatchTimestamp(match: Match): number | null {
  if (match.matchDate) {
    const d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

export default function MatchList({
  matches,
  mappings
}: {
  matches: Match[];
  mappings: Record<string, MappingInfo>;
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
    
    // For communication with the "Pour" button
    (window as any).selectedMatchIds = Array.from(newIds);
  }

  // Expose to window for the "Pour" button in another component
  useMemo(() => {
    if (typeof window !== "undefined") {
      (window as any).selectedMatchIds = Array.from(selectedIds);
    }
  }, [selectedIds]);

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

  function teamLabel(name: string | null): React.ReactNode {
    const isTbd = !name || isPlaceholderTeam(name);
    const effectiveName = isTbd ? "TBD" : name;
    const m = mappings[effectiveName];
    const alias = m?.alias || "—";
    const pid = m?.platformId || "";

    if (isTbd && !pid) return "TBD (—) (ID —)";
    
    return (
      <>
        {effectiveName} ({alias}) (ID {pid ? (
          <span className="text-blue-600 font-bold">{pid}</span>
        ) : (
          <span className="text-red-500 font-bold">ОТСУТСТВУЕТ</span>
        )})
      </>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {pastCount > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                showAll ? "bg-slate-200 text-slate-700" : "bg-blue-600 text-white"
              }`}
            >
              {showAll ? "Скрыть прошедшие" : `Показать все (+ ${pastCount} прошедших)`}
            </button>
          )}
          <span className="text-sm text-slate-500">
            {showAll ? `Все: ${matches.length}` : `Предстоящие: ${upcomingMatches.length}`}
          </span>
        </div>
        
        {displayMatches.length > 0 && (
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Выбрать все
          </label>
        )}
      </div>

      {displayMatches.length === 0 ? (
        <p className="text-sm text-slate-500">
          Нет предстоящих матчей.{" "}
          <button onClick={() => setShowAll(true)} className="text-blue-600 underline">
            Показать прошедшие ({pastCount})
          </button>
        </p>
      ) : (
        <div className="space-y-1 font-mono text-sm">
          {displayMatches.map((match) => {
            const ts = getMatchTimestamp(match);
            const isPast = ts ? ts <= now : false;
            return (
              <div
                key={match.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50 ${
                  isPast ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 flex items-start gap-2 min-w-0">
                  <span className="shrink-0 text-slate-400 text-xs w-[100px]" title={match.matchId}>
                    {match.matchId.slice(0, 12)}
                  </span>
                  <span className="shrink-0 text-slate-500 w-[130px]">{formatMoscowDate(match)}</span>
                  <span className="font-semibold text-slate-900 truncate">{teamLabel(match.teamAName)}</span>
                  <span className="text-slate-400 mx-1">-</span>
                  <span className="font-semibold text-slate-900 truncate">{teamLabel(match.teamBName)}</span>
                  {(match.scoreA != null || match.scoreB != null) && (
                    <span className="ml-2 text-slate-500 whitespace-nowrap">({match.scoreA ?? "—"}:{match.scoreB ?? "—"})</span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={selectedIds.has(match.id)}
                  onChange={() => toggleOne(match.id)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
