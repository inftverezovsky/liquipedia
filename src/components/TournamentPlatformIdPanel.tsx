"use client";

import { useState } from "react";

export default function TournamentPlatformIdPanel({
  tournamentId,
  initialPlatformId,
  disciplineSlug
}: {
  tournamentId: string;
  initialPlatformId: string | null;
  disciplineSlug: string;
}) {
  const [platformId, setPlatformId] = useState(initialPlatformId || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/platform-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: platformId.trim() })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Ошибка при сохранении ID");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Удалить ID шапки турнира?")) return;
    setSaving(true);
    try {
      await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/platform-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: "" })
      });
      setPlatformId("");
    } catch (error) {
      console.error(error);
      alert("Ошибка при удалении ID");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    const selectedIds = (window as any).selectedMatchIds || [];
    if (selectedIds.length === 0) {
      alert("Сначала выбери матчи чекбоксами!");
      return;
    }
    if (!platformId.trim()) {
      alert("Сначала укажи ID шапки!");
      return;
    }

    setExporting(true);
    try {
      // For now this is a placeholder for the actual upload logic
      console.log(`Exporting matches ${selectedIds.join(", ")} to platform header ${platformId}`);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      alert(`Готово! ${selectedIds.length} матчей успешно подготовлены для заливки в шапку ${platformId}. (Это демо-заглушка, реальная интеграция с платформой обсуждается)`);
    } catch (error) {
      console.error(error);
      alert("Ошибка при экспорте");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <label htmlFor="tournament-platform-id" className="block text-sm font-medium text-slate-700">
        ID шапки турнира (на рабочей платформе)
      </label>
      <div className="mt-2 flex flex-wrap gap-3">
        <input
          id="tournament-platform-id"
          type="text"
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          placeholder="Например: 554332"
          className="w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : saved ? "Сохранено ✓" : "Сохранить ID"}
          </button>
          
          <button
            onClick={handleRemove}
            disabled={saving}
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 border border-red-100"
            title="Очистить ID"
          >
            Удалить
          </button>
        </div>
        
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          {exporting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Заливка...
            </>
          ) : (
            <>Залить в платформу</>
          )}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Выберите матчи выше и нажмите &quot;Залить&quot;, чтобы отправить их на рабочую платформу.
      </p>
    </div>
  );
}
