"use client";

import { useState, useEffect } from "react";

export default function DisciplinePlatformIdPanel({ disciplineSlug }: { disciplineSlug: string }) {
  const [platformId, setPlatformId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/disciplines/${disciplineSlug}/platform-id`)
      .then(res => res.json())
      .then(data => {
        setPlatformId(data.platformId || "");
        setLoading(false);
      });
  }, [disciplineSlug]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/disciplines/${disciplineSlug}/platform-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: platformId.trim() })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Ошибка при сохранении глобального ID");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Удалить глобальный ID дисциплины?")) return;
    setSaving(true);
    try {
      await fetch(`/api/disciplines/${disciplineSlug}/platform-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: "" })
      });
      setPlatformId("");
    } catch (error) {
      console.error(error);
      alert("Ошибка при удалении глобального ID");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />;

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-blue-900">Глобальный ID дисциплины (Admin)</h2>
          <p className="text-xs text-blue-700">Матчи будут привязаны к этой родительской категории</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            placeholder="ID из админки"
            className="w-[180px] rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "..." : saved ? "✓" : "Save"}
            </button>
            <button
              onClick={handleRemove}
              disabled={saving}
              className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 border border-red-200"
            >
              Удалить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
