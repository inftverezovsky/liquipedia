"use client";

import { useState, useMemo } from "react";
import { isPlaceholderTeam } from "@/lib/teams";
import { SyncMatchesButton } from "./SyncMatchesButton";

type Match = {
  id: string;
  matchId: string;
  lpNumericalId: string | number | null; // BigInt comes as string
  platformId: string | null;
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

function getMatchDateObj(match: Match): Date | null {
  let d: Date | null = null;
  if (match.matchDateTime) {
    // Try to parse exact datetime string (e.g., "May 7, 2026 - 15:00 UTC")
    const cleaned = match.matchDateTime.replace(/\s*-\s*/, " ").replace(/\s+[A-Z]{2,5}$/, "");
    const parsed = new Date(cleaned + " UTC");
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d && match.matchDate) {
    d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
    if (isNaN(d.getTime())) d = null;
  }
  return d;
}

function getMatchTimestamp(match: Match): number | null {
  const d = getMatchDateObj(match);
  return d ? d.getTime() : null;
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
      return a.id.localeCompare(b.id);
    });
  }, [matches]);

  const now = Date.now();
  const upcomingMatches = useMemo(() => sortedMatches.filter((m) => {
    const ts = getMatchTimestamp(m);
    if (!ts) return true;
    // Keep matches that are upcoming or have no date
    return ts > now;
  }), [sortedMatches, now]);

  const pastCount = matches.length - upcomingMatches.length;
  const displayMatches = showAll ? sortedMatches : upcomingMatches;

  const allSelected = displayMatches.length > 0 && displayMatches.every(m => selectedIds.has(m.id));

  function toggleAll() {
    const newIds = new Set(selectedIds);
    if (allSelected) {
      displayMatches.forEach(m => newIds.delete(m.id));
    } else {
      displayMatches.forEach(m => newIds.add(m.id));
    }
    setSelectedIds(newIds);
  }

  function toggleOne(id: string) {
    const newIds = new Set(selectedIds);
    if (newIds.has(id)) newIds.delete(id);
    else newIds.add(id);
    setSelectedIds(newIds);
  }

  function formatMoscowDate(match: Match): string {
    const d = getMatchDateObj(match);
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

  function TeamDisplay({ name, side }: { name: string | null; side: "left" | "right" }) {
    const isTbd = !name || isPlaceholderTeam(name);
    const effectiveName = isTbd ? "TBD" : name;
    const m = mappings[effectiveName];
    const alias = m?.alias || "—";
    const pid = m?.platformId || "";

    return (
      <div className={`flex flex-col min-w-0 ${side === "left" ? "text-right" : "text-left"}`}>
        <span className="truncate text-sm font-black text-slate-950">
          {effectiveName}
        </span>
        <div className={`flex items-center gap-1.5 mt-0.5 ${side === "left" ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] font-bold text-slate-500">({alias})</span>
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${pid ? "bg-indigo-600 text-white" : "bg-rose-100 text-rose-600"}`}>
            {pid || "NO ID"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-3">
          {pastCount > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`rounded-xl px-4 py-2 text-xs font-black transition-all ${
                showAll ? "bg-slate-200 text-slate-700" : "btn-primary px-6 py-2"
              }`}
            >
              {showAll ? "Скрыть прошедшие" : `Архив (+${pastCount})`}
            </button>
          )}
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-900 border border-slate-200">
            {showAll ? "Full List" : "Upcoming"}
          </div>
        </div>

        <SyncMatchesButton 
          selectedIds={Array.from(selectedIds)} 
          disciplineSlug={disciplineSlug} 
          onSuccess={() => window.location.reload()}
        />
      </div>

      <div className="mb-4 flex items-center justify-between px-2">
        {displayMatches.length > 0 && (
          <label className="flex items-center gap-2.5 cursor-pointer text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 hover:text-indigo-600 transition-colors">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Выбрать все
          </label>
        )}
      </div>

      {displayMatches.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center bg-white/50">
          <p className="text-sm font-black text-slate-400">Нет предстоящих матчей.</p>
          <button onClick={() => setShowAll(true)} className="mt-4 text-xs font-black uppercase tracking-widest text-indigo-600 hover:underline">
            Показать архив
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {displayMatches.map((match) => {
            const ts = getMatchTimestamp(match);
            const isPast = ts ? ts <= now : false;
            const isConflict = match.rawText?.includes("CONFLICT");
            const isReady = isMatchReady(match);
            const isSynced = !!match.syncedAt;
            
            return (
              <div
                key={match.id}
                className={`group relative flex flex-col rounded-[2rem] border border-slate-200 p-6 transition-all hover:border-indigo-200 hover:shadow-xl ${
                  isPast ? "bg-slate-50 opacity-80" : "bg-white"
                } ${isConflict ? "border-amber-300 bg-amber-50" : ""} ${isSynced ? "ring-2 ring-indigo-500/20" : ""}`}
              >
                <div className="flex items-center justify-between">
                  {/* Meta / IDs */}
                  <div className="flex flex-wrap items-center gap-3">
                     <div className={`h-2 w-2 rounded-full ${isReady ? "bg-green-500" : "bg-rose-500"}`} />
                     <div className="flex items-center gap-1.5">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LP ID:</span>
                       <span className="text-[10px] font-black text-slate-900 tabular-nums">{match.lpNumericalId || "Generating..."}</span>
                     </div>
                     <div className="h-3 w-px bg-slate-100" />
                     <div className="flex items-center gap-1.5">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin ID:</span>
                       <span className="text-[10px] font-bold text-slate-500 tabular-nums truncate">Поиск...</span>
                     </div>
                     {match.platformId && (
                       <>
                         <div className="h-3 w-px bg-slate-100" />
                         <div className="flex items-center gap-1.5">
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Platform ID:</span>
                           <span className="text-[10px] font-black text-indigo-600 tabular-nums">{match.platformId}</span>
                         </div>
                       </>
                     )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm font-black text-slate-950 tabular-nums">{formatMoscowDate(match)}</span>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(match.id)}
                      onChange={() => toggleOne(match.id)}
                      className="h-6 w-6 cursor-pointer rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-transform group-hover:scale-110 shadow-sm"
                    />
                  </div>
                </div>

                {/* Match Row */}
                <div className="mt-6 flex items-center justify-between gap-8 border-t border-slate-100 pt-6">
                  <div className="flex-1 min-w-0">
                    <TeamDisplay name={match.teamAName} side="left" />
                  </div>
                  
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">VS</div>
                    {(match.scoreA != null || match.scoreB != null) && (
                      <div className={`text-3xl font-black tabular-nums tracking-tighter ${isConflict ? "text-amber-600" : "text-slate-950"}`}>
                        {match.scoreA ?? "0"} <span className="text-slate-300">:</span> {match.scoreB ?? "0"}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <TeamDisplay name={match.teamBName} side="right" />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     {match.stage} {match.round ? `• ${match.round}` : ""}
                   </div>
                   {isSynced && (
                     <div className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black text-white uppercase tracking-widest">
                       <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>
                       Synced
                     </div>
                   )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
