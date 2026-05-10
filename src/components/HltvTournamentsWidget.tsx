"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Trophy, ArrowRight, ExternalLink, Loader2, Link as LinkIcon, Plus, Check } from "lucide-react";


type HltvTournament = {
  title: string;
  url: string;
  id: string;
  status?: 'ongoing' | 'upcoming';
  isLinked?: boolean;
  dbId?: string | null;
  dates?: string;
};

export default function HltvTournamentsWidget({ disciplineSlug }: { disciplineSlug: string }) {
  const [tournaments, setTournaments] = useState<HltvTournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ status: 'online' | 'error' | 'loading', isCloudflare?: boolean }>({ status: 'loading' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchHltvTournaments = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${disciplineSlug}/hltv/events${force ? "?force=true" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      
      if (data.ok && data.events) {
        setTournaments(data.events);
        setHealth({ status: 'online' });
      }
    } catch (err: any) {
      setError("Не удалось загрузить HLTV турниры");
      setHealth({ status: 'error', isCloudflare: err.message.includes("403") || err.message.includes("Cloudflare") });
    } finally {
      setLoading(false);
    }
  }, [disciplineSlug]);

  const handleCreateTournament = async (t: HltvTournament) => {
    if (actionLoading) return;
    setActionLoading(t.title);
    try {
      const res = await fetch(`/api/${disciplineSlug}/tournament/from-hltv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t)
      });
      const data = await res.json();
      if (data.ok) {
        setTournaments(prev => prev.map(item => 
          item.title === t.title ? { ...item, isLinked: true, dbId: data.tournament.id } : item
        ));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <aside className="premium-card h-fit flex flex-col bg-white border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-950 uppercase flex items-center gap-2">
            <Trophy className="w-4 h-4 text-indigo-600" />
            Актуальные Турниры HLTV
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {health.status === 'loading' ? (
              <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
            ) : health.status === 'online' ? (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Прокси Активен</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5" title={health.isCloudflare ? "Blocked by Cloudflare" : "Proxy Error"}>
                <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Прокси Заблокирован</span>
              </div>
            )}
          </div>
        </div>
        <button 
          onClick={() => fetchHltvTournaments(tournaments.length > 0)}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        </button>
      </div>

      <div className="p-0 overflow-y-auto max-h-[500px] custom-scrollbar min-h-[120px] flex flex-col">
        {loading && tournaments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <div className="h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-4" />
             <div className="text-sm font-black text-slate-950 uppercase tracking-widest">Сканирование HLTV...</div>
          </div>
        ) : tournaments.length === 0 && !loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
             <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                <Trophy className="w-8 h-8 text-slate-300" />
             </div>
             <button 
               onClick={() => fetchHltvTournaments(false)}
               className="text-sm font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest underline decoration-indigo-200 underline-offset-8 transition-all"
             >
               Нажмите, чтобы загрузить список
             </button>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm font-bold text-rose-500">{error}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tournaments.map((t, i) => (
              <li key={`${t.title}-${i}`} className="p-5 hover:bg-slate-50 transition-colors group relative">
                <div className="flex justify-between items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                       <span className={`h-1.5 w-1.5 rounded-full ${t.status === 'ongoing' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                         {t.status === 'ongoing' ? 'Ongoing' : 'Upcoming'}
                       </span>
                       {t.isLinked && (
                         <span className="flex items-center gap-1 text-[8px] font-black text-indigo-500 uppercase bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                           <Check className="w-2.5 h-2.5" /> В базе данных
                         </span>
                       )}
                    </div>
                    <h3 className="text-sm font-black text-slate-950 leading-tight group-hover:text-indigo-600 transition-colors truncate mb-1">
                      {t.title}
                    </h3>
                    {t.dates && (
                      <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wide">
                        {t.dates}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                       <a 
                         href={t.url} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="text-[9px] font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                       >
                         <ExternalLink className="w-3 h-3" /> HLTV
                       </a>
                       {t.dbId && (
                         <Link 
                           href={`/counterstrike/tournament/${t.dbId}`}
                           className="text-[9px] font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                         >
                           <LinkIcon className="w-3 h-3" /> Открыть в админке
                         </Link>
                       )}
                    </div>
                  </div>

                  {!t.isLinked ? (
                    <button
                      onClick={() => handleCreateTournament(t)}
                      disabled={!!actionLoading}
                      className="shrink-0 p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100 flex items-center gap-2 group/btn"
                    >
                      {actionLoading === t.title ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-widest hidden group-hover/btn:inline">Создать</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="shrink-0 p-2.5 rounded-xl bg-slate-50 text-slate-300 border border-slate-100">
                       <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50">
        <Link 
          href={`/${disciplineSlug}/hltv`}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group shadow-sm"
        >
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
          Перейти к ручному импорту
        </Link>
      </div>
      <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Загрузка данных только по запросу</span>
      </div>
    </aside>
  );
}
