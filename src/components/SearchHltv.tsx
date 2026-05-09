"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type HltvEvent = {
  id: string;
  title: string;
  url: string;
  dates?: string;
};

export default function SearchHltv({ disciplineSlug }: { disciplineSlug: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HltvEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(`/api/${disciplineSlug}/search-hltv?query=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
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

  const handleImport = async (hltvEvent: HltvEvent) => {
    setImportingId(hltvEvent.id);
    try {
      const response = await fetch(`/api/${disciplineSlug}/import-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: hltvEvent.title, 
          pageUrl: hltvEvent.url,
          source: "hltv"
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      
      if (data.tournament?.id) {
        router.push(`/${disciplineSlug}/tournament/${data.tournament.id}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import error");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
      <form onSubmit={onSubmit} className="space-y-6">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900" htmlFor="hltv-query">
          Интеллектуальный поиск по HLTV
        </label>
        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            id="hltv-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Введите название турнира на HLTV"
            className="min-h-[56px] flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-slate-950 font-bold outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-600/5 placeholder:text-slate-300"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="flex items-center justify-center rounded-2xl bg-indigo-600 px-10 min-h-[56px] text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
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
            <span>RESULTS: {results.length}</span>
            <span className="flex items-center gap-2">
               <span className="h-1.5 w-1.5 rounded-full bg-orange-600 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
               HLTV DATABASE
            </span>
          </div>
        )}

        {results.map((result) => (
          <article key={result.id} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-8 transition-all hover:border-orange-200 hover:bg-white hover:shadow-xl group">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-3">
                   {result.dates && (
                     <span className="inline-flex items-center rounded-lg bg-orange-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-orange-600 border border-orange-100">
                       {result.dates}
                     </span>
                   )}
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                     ID: {result.id}
                   </span>
                </div>
                
                <h2 className="text-2xl font-black text-slate-950 transition-colors group-hover:text-orange-600 leading-tight">
                  {result.title}
                </h2>
                <p className="mt-3 truncate text-[10px] font-black text-slate-400 uppercase tracking-tight">
                  {result.url}
                </p>
              </div>
              
              <div className="flex shrink-0 flex-wrap gap-3">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center justify-center px-6 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-slate-900 hover:bg-slate-50 transition-all"
                >
                  HLTV
                </a>
                <button
                  onClick={() => handleImport(result)}
                  disabled={!!importingId}
                  className="flex h-12 items-center justify-center px-10 rounded-xl bg-slate-950 text-[10px] font-black uppercase tracking-widest text-white hover:bg-orange-600 transition-all disabled:opacity-50 shadow-lg shadow-slate-200"
                >
                  {importingId === result.id ? "ЗАГРУЗКА..." : "ЗАГРУЗИТЬ"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
