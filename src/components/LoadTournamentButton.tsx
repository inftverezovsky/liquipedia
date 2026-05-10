"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { detectTournamentSource, type TournamentSource } from "@/lib/tournamentSource";
import { dispatchTournamentDataUpdated } from "@/lib/clientEvents";

export default function LoadTournamentButton({
  pageId,
  title,
  pageUrl,
  disciplineSlug,
  initialTournamentId,
  force = false,
  source
}: {
  pageId?: number | null;
  title: string;
  pageUrl?: string | null;
  disciplineSlug: string;
  initialTournamentId?: string;
  force?: boolean;
  source?: TournamentSource;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTournament() {
    if (initialTournamentId && !force) {
      router.push(`/${disciplineSlug}/tournament/${initialTournamentId}`);
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const resolvedSource = source ?? detectTournamentSource(pageUrl);
      const response = await fetch(`/api/${disciplineSlug}/import-tournament`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, title, pageUrl, force: true, source: resolvedSource })
      });

      const data = (await response.json()) as { tournament?: { id: string }; error?: string };

      if (!response.ok || !data.tournament?.id) {
        throw new Error(data.error ?? "Не удалось загрузить турнир");
      }

      router.push(`/${disciplineSlug}/tournament/${data.tournament.id}`);
      router.refresh();
      dispatchTournamentDataUpdated({ tournamentId: data.tournament.id, disciplineSlug });
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
        className="rounded-xl bg-slate-500/5 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-slate-600 border border-slate-200/50 hover:bg-slate-500/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
      >
        {loading ? (force ? "Обновляю..." : "Загружаю...") : force ? "Обновить данные" : initialTournamentId ? "Открыть" : "Загрузить данные"}
      </button>
      {error ? <p className="max-w-56 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
