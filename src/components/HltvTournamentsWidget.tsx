"use client";

import { useState, useEffect, useCallback } from "react";
import SearchHltv from "@/components/SearchHltv";

type HltvTournament = {
  title: string;
  url: string;
  id: string;
};

export default function HltvTournamentsWidget({ disciplineSlug }: { disciplineSlug: string }) {
  const [tournaments, setTournaments] = useState<HltvTournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const fetchHltvTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/${disciplineSlug}/hltv/matches`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      
      if (data.ok && data.matches) {
        const unique = new Map<string, HltvTournament>();
        const now = Date.now() / 1000;
        const oneDaySeconds = 24 * 60 * 60;
        const tomorrowEnd = now + oneDaySeconds;

        data.matches.forEach((m: any) => {
          // Filter: current (unix_time <= now + small buffer) or within 24h
          const isRelevant = m.unix_time === 0 || m.unix_time <= tomorrowEnd;

          if (isRelevant && m.tournament && m.tournament !== "Upcoming") {
            unique.set(m.tournament, {
              title: m.tournament,
              url: `https://www.hltv.org/search?query=${encodeURIComponent(m.tournament)}`,
              id: ""
            });
          }
        });
        setTournaments(Array.from(unique.values()));
      }
    } catch (err) {
      setError("Не удалось загрузить HLTV турниры");
    } finally {
      setLoading(false);
    }
  }, [disciplineSlug]);

  // Removed automatic load on mount
  /*
  useEffect(() => {
    fetchHltvTournaments();
  }, [fetchHltvTournaments]);
  */

  return (
    <aside className="premium-card h-fit flex flex-col bg-white border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight text-slate-950 uppercase">Актуальные с HLTV</h2>
          <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Турниры из текущего расписания</p>
        </div>
        <button
          onClick={() => fetchHltvTournaments()}
          disabled={loading}
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
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
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
             </div>
             <button 
               onClick={() => fetchHltvTournaments()}
               className="text-sm font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest underline decoration-indigo-200 underline-offset-8 transition-all"
             >
               Нажмите, чтобы загрузить список
             </button>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm font-bold text-rose-500">{error}</div>
        ) : tournaments.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-slate-400">Нет активных HLTV турниров</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tournaments.map((t, i) => (
              <li key={`${t.title}-${i}`} className="p-5 hover:bg-slate-50 transition-colors group">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-950 leading-tight group-hover:text-indigo-600 transition-colors truncate">
                      {t.title}
                    </h3>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <a href={t.url} target="_blank" rel="noreferrer" className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest underline decoration-slate-200 underline-offset-4">
                    HLTV
                  </a>
                  <button
                    onClick={() => {
                      const input = document.getElementById('hltv-query') as HTMLInputElement;
                      if (input) {
                        input.value = t.title;
                        input.form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="flex h-9 items-center justify-center px-6 rounded-xl bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                  >
                    Загрузить данные
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50">
        <button 
          onClick={() => {
            const hltvSearch = document.getElementById('hltv-query');
            if (hltvSearch) hltvSearch.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-all group shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
          Перейти к ручному импорту
        </button>
      </div>
      <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Загрузка данных только по запросу</span>
      </div>
    </aside>
  );
}
