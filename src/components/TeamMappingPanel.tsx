"use client";

import { useState } from "react";

type TeamMappingRecord = {
  id: string;
  liquipediaName: string;
  alias: string | null;
  platformId: string | null;
  logoUrl?: string | null;
};

export default function TeamMappingPanel({
  teamNames,
  initialMappings,
  disciplineSlug
}: {
  teamNames: string[];
  initialMappings: TeamMappingRecord[];
  disciplineSlug: string;
}) {
  const [mappings, setMappings] = useState<Record<string, { alias: string; platformId: string; logoUrl: string; saved: boolean }>>(() => {
    const map: Record<string, { alias: string; platformId: string; logoUrl: string; saved: boolean }> = {};
    for (const name of teamNames) {
      const existing = initialMappings.find((m) => m.liquipediaName === name);
      map[name] = {
        alias: existing?.alias ?? "",
        platformId: existing?.platformId ?? "",
        logoUrl: existing?.logoUrl ?? "",
        saved: !!(existing?.alias || existing?.platformId)
      };
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);

  async function handleSave(name: string) {
    setSaving(name);
    try {
      const entry = mappings[name];
      await fetch("/api/team-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liquipediaName: name,
          disciplineSlug,
          alias: entry.alias,
          platformId: entry.platformId,
          logoUrl: entry.logoUrl || undefined
        })
      });
      setMappings((prev) => ({
        ...prev,
        [name]: { ...prev[name], saved: true }
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Удалить маппинг для "${name}"?`)) return;
    setSaving(name);
    try {
      await fetch(`/api/team-mapping?name=${encodeURIComponent(name)}&discipline=${disciplineSlug}`, {
        method: "DELETE"
      });
      setMappings((prev) => ({
        ...prev,
        [name]: { alias: "", platformId: "", logoUrl: "", saved: false }
      }));
    } catch (err) {
      console.error(err);
      alert("Ошибка при удалении");
    } finally {
      setSaving(null);
    }
  }

  function handleChange(name: string, field: "alias" | "platformId" | "logoUrl", value: string) {
    setMappings((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: value, saved: false }
    }));
  }

  const sorted = [...teamNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
          <tr>
            <th className="border-b border-slate-200 py-3 pr-4">Team (Liquipedia)</th>
            <th className="border-b border-slate-200 py-3 pr-4 w-[240px]">Каноническое / Альт. имя</th>
            <th className="border-b border-slate-200 py-3 pr-4 w-[160px]">Platform ID</th>
            <th className="border-b border-slate-200 py-3 pr-4 w-[220px]">Управление</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((name) => {
            const entry = mappings[name] ?? { alias: "", platformId: "", logoUrl: "", saved: false };
            const isSaving = saving === name;
            return (
              <tr key={name} className="hover:bg-slate-50 transition-colors">
                <td className="border-b border-slate-100 py-4 pr-4">
                  <span className="font-semibold text-slate-950">{name}</span>
                </td>
                <td className="border-b border-slate-100 py-4 pr-4">
                  <input
                    type="text"
                    value={entry.alias}
                    onChange={(e) => handleChange(name, "alias", e.target.value)}
                    placeholder="Team Vitality..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 focus:border-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100 transition"
                  />
                </td>
                <td className="border-b border-slate-100 py-4 pr-4">
                  <input
                    type="text"
                    value={entry.platformId}
                    onChange={(e) => handleChange(name, "platformId", e.target.value)}
                    placeholder="ID:123"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 font-mono focus:border-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-100 transition"
                  />
                </td>
                <td className="border-b border-slate-100 py-4 pr-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSave(name)}
                      disabled={isSaving || entry.saved}
                      className={`min-w-[110px] rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                        entry.saved
                          ? "bg-slate-100 text-slate-400 cursor-default"
                          : isSaving
                          ? "bg-slate-100 text-slate-400"
                          : "bg-slate-950 text-white hover:bg-slate-800"
                      }`}
                    >
                      {isSaving ? "..." : entry.saved ? "✓ Ок" : "Применить"}
                    </button>
                    <button
                      onClick={() => handleDelete(name)}
                      disabled={isSaving}
                      className="rounded-xl p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Сбросить маппинг"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
