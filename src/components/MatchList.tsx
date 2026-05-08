"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { isPlaceholderTeam } from "@/lib/teams";

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
  
  // 1. Priority: actual Date object (from data-timestamp)
  if (match.matchDate) {
    d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
    if (isNaN(d.getTime())) d = null;
  }
  
  // 2. Fallback: parse the matchDateTime string
  if (!d && match.matchDateTime) {
    const cleaned = match.matchDateTime.replace(/\s*-\s*/, " ").replace(/\s+[A-Z]{2,5}$/, "");
    const parsed = new Date(cleaned + " UTC");
    if (!isNaN(parsed.getTime())) d = parsed;
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
  disciplineSlug,
  selectedIds,
  setSelectedIds
}: {
  matches: Match[];
  mappings: Record<string, MappingInfo>;
  disciplineSlug: string;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
}) {
  const params = useParams();
  const tournamentId = params.id as string;
  
  const [showAll, setShowAll] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

  // Fetch upload history on mount and on success event
  useEffect(() => {
    async function fetchHistory() {
      if (!tournamentId) return;
      try {
        const res = await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/upload-history`);
        const data = await res.json();
        if (data.ok) setUploadHistory(data.logs);
      } catch (e) {
        console.error("Failed to fetch upload history:", e);
      }
    }
    fetchHistory();

    const handleSuccess = () => fetchHistory();
    window.addEventListener('admin-upload-success', handleSuccess);
    return () => window.removeEventListener('admin-upload-success', handleSuccess);
  }, [disciplineSlug, tournamentId]);

  const dedupedMatches = useMemo(() => {
    const results: Match[] = [];
    
    matches.forEach(m => {
      const tA = m.teamAName?.trim().toLowerCase() || "";
      const tB = m.teamBName?.trim().toLowerCase() || "";
      // Allow all TBD matches (numbered or generic) without deduplication by pair
      if (isPlaceholderTeam(tA) || isPlaceholderTeam(tB)) {
        results.push(m);
        return;
      }
      const [t1, t2] = [tA, tB].sort();
      const d = getMatchDateObj(m);
      const ts = d ? d.getTime() : 0;

      // Find if we already have this pair within a 12-hour window
      const existingIdx = results.findIndex(r => {
        const rA = r.teamAName?.trim().toLowerCase() || "";
        const rB = r.teamBName?.trim().toLowerCase() || "";
        const [rt1, rt2] = [rA, rB].sort();
        if (rt1 !== t1 || rt2 !== t2) return false;
        
        const rd = getMatchDateObj(r);
        const rts = rd ? rd.getTime() : 0;
        
        // 12 hour window (43,200,000 ms)
        return Math.abs(rts - ts) < 12 * 60 * 60 * 1000;
      });

      if (existingIdx === -1) {
        results.push(m);
      } else {
        // Preference: match with platformId or the one with a more recent date if both have IDs
        const existing = results[existingIdx];
        if (!existing.platformId && m.platformId) {
          results[existingIdx] = m;
        } else if (existing.platformId && m.platformId) {
          // If both have IDs, maybe keep the one with the later matchDate (likely more updated)
          if (ts > (getMatchDateObj(existing)?.getTime() || 0)) {
            results[existingIdx] = m;
          }
        }
      }
    });
    return results;
  }, [matches]);

  const sortedMatches = useMemo(() => {
    return [...dedupedMatches].sort((a, b) => {
      const tsA = getMatchTimestamp(a) || Infinity;
      const tsB = getMatchTimestamp(b) || Infinity;
      if (tsA !== tsB) return tsA - tsB;
      return a.id.localeCompare(b.id);
    });
  }, [dedupedMatches]);

  const now = Date.now();
  const upcomingMatches = useMemo(() => sortedMatches.filter((m) => {
    const ts = getMatchTimestamp(m);
    // Keep placeholder matches (TBD) in upcoming even if their date is past
    const isTbd = isPlaceholderTeam(m.teamAName) || isPlaceholderTeam(m.teamBName);
    if (isTbd) return true;
    
    if (!ts) return true;
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
    
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(d).replace(",", "");
  }

  function isMatchReady(match: Match): boolean {
    const isTbdA = !match.teamAName || isPlaceholderTeam(match.teamAName);
    const isTbdB = !match.teamBName || isPlaceholderTeam(match.teamBName);
    const pidA = isTbdA ? "tbd" : mappings[match.teamAName!]?.platformId;
    const pidB = isTbdB ? "tbd" : mappings[match.teamBName!]?.platformId;
    return !!(pidA && pidB);
  }

  function isMatchInHistory(match: Match): boolean {
    if (!match.teamAName || !match.teamBName) return false;
    const pidA = mappings[match.teamAName]?.platformId;
    const pidB = mappings[match.teamBName]?.platformId;
    if (!pidA || !pidB) return false;

    const d = getMatchDateObj(match);
    if (!d) return false;
    
    // Format exactly as it is sent to the API: dd.MM.yyyy HH:mm:ss
    const mDate = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    }).format(d).replace(",", "");

    return uploadHistory.some(log => {
      const payload = log.phpArrayJson;
      if (!payload || !payload.match) return false;
      return payload.match.some((m: any) => {
        // Compare platform IDs and formatted date string
        const teamMatch = 
          (String(m.team1) === String(pidA) && String(m.team2) === String(pidB)) ||
          (String(m.team1) === String(pidB) && String(m.team2) === String(pidA));
        
        return teamMatch && m.date === mDate;
      });
    });
  }

  function TeamDisplay({ name, side }: { name: string | null; side: "left" | "right" }) {
    const isGenericTbd = !name || name.toLowerCase() === "tbd";
    const isNumberedTbd = name ? /^tbd\d+$/i.test(name) : false;
    const effectiveName = (isGenericTbd || isNumberedTbd) ? (name || "TBD") : name;
    const m = mappings[effectiveName];
    const alias = m?.alias;
    const pid = m?.platformId || "";

    return (
      <div className={`flex flex-col min-w-0 ${side === "left" ? "text-right" : "text-left"}`}>
        <span className="truncate text-xl font-medium text-slate-900 tracking-tight leading-tight">
          {effectiveName}
        </span>
        <div className={`flex items-center gap-2 mt-1.5 ${side === "left" ? "justify-end" : "justify-start"}`}>
          {alias && <span className="text-[10px] font-normal text-slate-400 uppercase tracking-wider">{alias}</span>}
          <span className={`text-[10px] font-normal px-2 py-0.5 rounded-full border ${pid ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-rose-50 border-rose-100 text-rose-600"}`}>
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
              className={`rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                showAll ? "bg-slate-100 text-slate-500" : "bg-slate-500/5 backdrop-blur-sm text-slate-600 px-6 py-2 border border-slate-200/50 hover:bg-slate-500/10"
              }`}
            >
              {showAll ? "Скрыть прошедшие" : `Архив (+${pastCount})`}
            </button>
          )}
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-slate-900 border border-slate-200">
            {showAll ? "Full List" : "Upcoming"}
          </div>
        </div>

      </div>

      <div className="mb-4 flex items-center justify-between px-2">
        {displayMatches.length > 0 && (
          <div 
            onClick={toggleAll}
            className="flex items-center gap-2.5 cursor-pointer text-[10px] font-medium uppercase tracking-[0.2em] text-slate-900 hover:text-emerald-600 transition-colors group/all"
          >
            <div className={`h-4 w-4 rounded border transition-all flex items-center justify-center ${
              allSelected 
                ? "bg-emerald-500/5 border-emerald-500/20" 
                : "bg-white border-slate-200"
            }`}>
              {allSelected && (
                <svg className="h-2.5 w-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            Выбрать все
          </div>
        )}
      </div>

      {displayMatches.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center bg-white/50">
          <p className="text-sm font-medium text-slate-400">Нет предстоящих матчей.</p>
          <button onClick={() => setShowAll(true)} className="mt-4 text-xs font-medium uppercase tracking-widest text-slate-600 hover:underline">
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
            const isSynced = !!match.syncedAt || isMatchInHistory(match);
            const isSelected = selectedIds.has(match.id);
            
            return (
              <div
                key={match.id}
                className={`group relative flex flex-col rounded-[2.5rem] border border-slate-200 p-8 transition-all hover:border-slate-300 hover:shadow-2xl ${
                  isPast ? "bg-slate-50 opacity-80" : "bg-white"
                } ${isConflict ? "border-amber-300 bg-amber-50" : ""} ${isSynced ? "ring-2 ring-slate-800/10" : ""}`}
              >
                <div className="flex items-center justify-between">
                  {/* Meta / IDs */}
                  <div className="flex flex-wrap items-center gap-3">
                     <div className={`h-2.5 w-2.5 rounded-full ${isReady ? "bg-emerald-500" : "bg-rose-500 shadow-lg shadow-rose-200"}`} />
                     {match.platformId && (
                       <>
                         <div className="h-3 w-px bg-slate-100" />
                         <div className="flex items-center gap-2">
                           <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Platform ID:</span>
                           <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-900 tabular-nums">{match.platformId}</span>
                         </div>
                       </>
                     )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-base font-medium text-slate-900 tabular-nums tracking-tight">{formatMoscowDate(match)}</span>
                    <div 
                      onClick={() => toggleOne(match.id)}
                      className={`h-6 w-6 cursor-pointer rounded-lg border transition-all flex items-center justify-center hover:scale-105 active:scale-95 ${
                        isSelected 
                          ? "bg-emerald-500/5 border-emerald-500/20 backdrop-blur-sm" 
                          : "bg-white border-slate-100"
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>

                {/* Match Row */}
                <div className="mt-6 flex items-center justify-between gap-8 border-t border-slate-100 pt-6">
                  <div className="flex-1 min-w-0">
                    <TeamDisplay name={match.teamAName} side="left" />
                  </div>
                  
                  <div className="flex flex-col items-center gap-3 shrink-0">
                    <div className="rounded-full bg-slate-50 border border-slate-200 px-4 py-1.5 text-[9px] font-medium text-slate-400 uppercase tracking-[0.3em]">VS</div>
                    {(match.scoreA != null || match.scoreB != null) && (
                      <div className={`text-4xl font-medium tabular-nums tracking-tighter ${isConflict ? "text-amber-600" : "text-slate-900"}`}>
                        {match.scoreA ?? "0"} <span className="text-slate-200">:</span> {match.scoreB ?? "0"}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <TeamDisplay name={match.teamBName} side="right" />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                   <div className="text-[10px] font-normal text-slate-400 uppercase tracking-widest">
                     {match.stage} {match.round ? `• ${match.round}` : ""}
                   </div>
                    {isSynced && (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/5 backdrop-blur-sm px-3 py-1 text-[10px] font-medium text-emerald-600 border border-emerald-500/20 shadow-sm">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ЗАЛИТ
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
