"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoadTournamentButton({
  pageId,
  title,
  pageUrl,
  disciplineSlug
}: {
  pageId?: number | null;
  title: string;
  pageUrl?: string | null;
  disciplineSlug: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTournament() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/${disciplineSlug}/import-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, title, pageUrl })
      });

      const data = (await response.json()) as { tournament?: { id: string }; error?: string };

      if (!response.ok || !data.tournament?.id) {
        throw new Error(data.error ?? "Не удалось загрузить турнир");
      }

      router.push(`/${disciplineSlug}/tournament/${data.tournament.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={loadTournament}
        disabled={loading}
        className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "Загружаю..." : "Загрузить данные"}
      </button>
      {error ? <p className="max-w-56 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
