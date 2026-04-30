"use client";

import { FormEvent, useState } from "react";
import LoadTournamentButton from "@/components/LoadTournamentButton";

type SearchResult = {
  pageId: number;
  title: string;
  pageUrl: string;
  snippet?: string | null;
  score?: number | null;
  wordCount?: number | null;
  dates?: string | null;
};

type SearchResponse = {
  query: string;
  cacheHit: boolean;
  results: SearchResult[];
};

export default function SearchTournament() {
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

    try {
      const response = await fetch("/api/dota2/search-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `API returned non-JSON response. Status: ${response.status}. Body starts with: ${text.slice(0, 120)}`
        );
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось выполнить поиск");
      }

      setResults(data.results ?? []);
      setCacheHit(data.cacheHit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-slate-200">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="tournament-query">
            Название чемпионата
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="tournament-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: Riyadh Masters"
              className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-200"
            />
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="min-h-12 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Ищу..." : "Найти чемпионат"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mt-6 space-y-3">
          {results.length > 0 ? (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Найдено: {results.length}</span>
              <span>{cacheHit ? "из кеша" : "из Liquipedia API"}</span>
            </div>
          ) : null}

          {results.map((result) => (
            <article key={`${result.pageId}-${result.title}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-950">{result.title}</h2>
                  <p className="mt-1 break-all text-xs text-slate-500">{result.pageUrl}</p>
                  {result.dates && (
                    <div className="mt-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {result.dates}
                    </div>
                  )}
                  {result.snippet ? <p className="mt-3 text-sm text-slate-600">{result.snippet}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={result.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Открыть
                  </a>
                  <LoadTournamentButton pageId={result.pageId} title={result.title} pageUrl={result.pageUrl} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-soft">
        <h2 className="text-lg font-semibold">Как работает MVP</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-200">
          <li>Поиск идёт через MediaWiki API Liquipedia.</li>
          <li>Результаты поиска сохраняются в базу.</li>
          <li>Загрузка выбранного турнира запускается только вручную.</li>
          <li>Перед нормализацией сохраняется raw snapshot.</li>
          <li>Если часть данных не извлеклась, статус будет partial.</li>
        </ol>
        <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm text-slate-200">
          Не реализовано специально: игроки, составы, трансферы, фоновый sync, diff-мониторинг и сигналы.
        </div>
      </aside>
    </div>
  );
}
