"use client";

import { FormEvent, useState } from "react";
import LoadTournamentButton from "@/components/LoadTournamentButton";
import UpcomingTournamentsWidget from "@/components/UpcomingTournamentsWidget";

type SearchResult = {
  pageId: number;
  title: string;
  pageUrl: string;
  snippet?: string | null;
  score?: number | null;
  wordCount?: number | null;
  dates?: string | null;
};

export default function SearchTournament({ disciplineSlug, hideSidebar = false }: { disciplineSlug: string, hideSidebar?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cacheHit, setCacheHit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`/api/${disciplineSlug}/search-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
      setCacheHit(data.cacheHit);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError("Поиск занял слишком много времени. Попробуйте еще раз.");
      } else {
        setError(err instanceof Error ? err.message : "Search error");
      }
    } finally {
      setLoading(false);
      clearTimeout(timeoutId);
    }
  }

  const searchCard = (
    <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
      <form onSubmit={onSubmit} className="space-y-6">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900" htmlFor="tournament-query">
          Интеллектуальный поиск по Liquipedia
        </label>
        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            id="tournament-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Введите название турнира (напр. Riyadh Masters)"
            className="min-h-[56px] flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-slate-950 font-bold outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 placeholder:text-slate-300"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="btn-primary min-h-[56px] px-10 text-xs disabled:bg-slate-100 disabled:text-slate-400"
          >
            {loading ? "Поиск..." : "Найти"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-10 space-y-4">
        {results.length > 0 && (
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-900 px-2">
            <span>Results: {results.length}</span>
            <span className="flex items-center gap-2">
               <span className={`h-1.5 w-1.5 rounded-full ${cacheHit ? 'bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.5)]' : 'bg-slate-400'}`} />
               {cacheHit ? "Cached result" : "Live search"}
            </span>
          </div>
        )}

        {results.map((result) => (
          <article key={`${result.pageId}-${result.title}`} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-md">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-slate-950 transition-colors group-hover:text-indigo-600">{result.title}</h2>
                <p className="mt-2 truncate text-[10px] font-black text-slate-400 uppercase tracking-tight">{result.pageUrl}</p>
                
                {result.dates && (
                  <div className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">
                    {result.dates}
                  </div>
                )}
                
                {result.snippet && (
                  <p className="mt-6 text-sm font-bold leading-relaxed text-slate-900" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                )}
              </div>
              
              <div className="flex shrink-0 flex-wrap gap-3">
                <a
                  href={result.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center px-6 rounded-xl border border-slate-300 bg-white text-[10px] font-black uppercase tracking-widest text-slate-900 hover:bg-slate-50 transition-all"
                >
                  Wiki
                </a>
                <LoadTournamentButton
                  pageId={result.pageId}
                  title={result.title}
                  pageUrl={result.pageUrl}
                  disciplineSlug={disciplineSlug}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  if (hideSidebar) {
    return searchCard;
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      {searchCard}
      <UpcomingTournamentsWidget disciplineSlug={disciplineSlug} />
    </div>
  );
}
