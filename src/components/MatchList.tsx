"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { isPlaceholderTeam } from "@/lib/teams";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Layers, LayoutGrid, CheckCircle2, History } from "lucide-react";

type Match = {
  id: string;
  matchId: string;
  lpNumericalId: string | number | null;
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
  if (match.matchDate) {
    d = typeof match.matchDate === "string" ? new Date(match.matchDate) : match.matchDate;
    if (isNaN(d.getTime())) d = null;
  }
  if (!d && match.matchDateTime) {
    const cleaned = match.matchDateTime.replace(/\s*-\s*/, " ").replace(/\s+[A-Z]{2,5}$/, "");
    // Treat as MSK: create UTC date then subtract 3h
    const parsed = new Date(cleaned + "Z");
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
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
  setSelectedIds,
  mutate
}: {
  matches: Match[];
  mappings: Record<string, MappingInfo>;
  disciplineSlug: string;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  mutate?: () => void;
}) {
  const params = useParams();
  const tournamentId = params.id as string;
  
  const [showAll, setShowAll] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

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

    const handleSuccess = () => {
      fetchHistory();
      if (mutate) mutate();
      setSelectedIds(new Set());
    };
    window.addEventListener('admin-upload-success', handleSuccess);
    return () => window.removeEventListener('admin-upload-success', handleSuccess);
  }, [disciplineSlug, tournamentId, mutate, setSelectedIds]);

  const displayMatches = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneWeekForward = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return [...matches]
      .filter(m => {
        // 1. Скрываем матчи с результатами
        if (m.scoreA !== null || m.scoreB !== null) return false;

        // 2. Скрываем прошедшие матчи и матчи дальше чем на неделю
        const mDate = getMatchDateObj(m);
        if (mDate) {
          if (mDate < today || mDate > oneWeekForward) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const tsA = getMatchTimestamp(a) || Infinity;
        const tsB = getMatchTimestamp(b) || Infinity;
        if (tsA !== tsB) return tsA - tsB;
        return a.id.localeCompare(b.id);
      });
  }, [matches]);

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

  function formatNeutralDate(match: Match): string {
    const d = getMatchDateObj(match);
    if (!d) return "—";
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "UTC",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(d).replace(",", "");
  }

  function TeamDisplay({ name, side }: { name: string | null; side: "left" | "right" }) {
    const isGenericTbd = !name || name.toLowerCase() === "tbd";
    const isNumberedTbd = name ? /^tbd\d+$/i.test(name) : false;
    const effectiveName = (isGenericTbd || isNumberedTbd) ? (name || "TBD") : name;
    const m = mappings[effectiveName];
    const pid = m?.platformId || "";
    const logoUrl = m?.logoUrl;

    return (
      <div className={`flex flex-col min-w-0 ${side === "left" ? "text-right" : "text-left"}`}>
        <span className="truncate text-xl font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
          {effectiveName}
        </span>
        <div className={`flex items-center gap-2 mt-1 ${side === "left" ? "justify-end" : "justify-start"}`}>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${pid ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-600"}`}>
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
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-900 border border-slate-200">
            <LayoutGrid className="w-3 h-3" />
            Upcoming Matches
          </div>
        </div>

        {displayMatches.length > 0 && (
          <button 
            onClick={toggleAll}
            className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <div className={`h-4 w-4 rounded border transition-all flex items-center justify-center ${
              allSelected ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200"
            }`}>
              {allSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            Выбрать все
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {displayMatches.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center bg-white/50"
          >
            <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-400">Нет предстоящих матчей.</p>
          </motion.div>
        ) : (
          <motion.div 
            layout
            className="grid gap-4"
          >
            {displayMatches.map((match, idx) => {
              const isSelected = selectedIds.has(match.id);
              
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01, y: -2, transition: { duration: 0.2 } }}
                  transition={{ delay: idx * 0.02 }}
                  key={match.id}
                  onClick={() => toggleOne(match.id)}
                  className={`group relative flex flex-col rounded-[2rem] border p-6 transition-all cursor-pointer overflow-hidden bg-white ${
                    isSelected ? "border-indigo-600 ring-1 ring-indigo-600/10 glow-primary" : "border-slate-200 hover:border-indigo-300 hover:shadow-xl"
                  }`}
                >
                  {/* Shimmer overlay for selected state */}
                  {isSelected && <div className="absolute inset-0 shimmer pointer-events-none" />}
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${match.platformId ? "bg-emerald-500" : "bg-rose-500 animate-pulse"}`} />
                      {match.platformId && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          ID: <span className="text-slate-900">{match.platformId}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-slate-900 tabular-nums">{formatNeutralDate(match)}</span>
                      <div className={`h-5 w-5 rounded-md border transition-all flex items-center justify-center ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200"
                      }`}>
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <TeamDisplay name={match.teamAName} side="left" />
                    </div>
                    
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="rounded-full bg-slate-50 border border-slate-100 px-3 py-0.5 text-[8px] font-bold text-slate-300 uppercase tracking-[0.3em]">VS</div>
                      {(match.scoreA != null || match.scoreB != null) && (
                        <div className="text-3xl font-bold tabular-nums gradient-text">
                          {match.scoreA ?? "0"} <span className="text-slate-200">:</span> {match.scoreB ?? "0"}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <TeamDisplay name={match.teamBName} side="right" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                     <div>{match.stage} {match.round ? `• ${match.round}` : ""}</div>
                     {match.syncedAt && (
                       <div className="text-emerald-600 flex items-center gap-1">
                         <CheckCircle2 className="w-3 h-3" /> ОПУБЛИКОВАН
                       </div>
                     )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

