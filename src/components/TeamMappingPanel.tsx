"use client";

import { useState } from "react";

type TeamMappingRecord = {
  id: string;
  liquipediaName: string;
  alias: string | null;
  platformId: string | null;
};

export default function TeamMappingPanel({
  teamNames,
  initialMappings
}: {
  teamNames: string[];
  initialMappings: TeamMappingRecord[];
}) {
  const [mappings, setMappings] = useState<Record<string, { alias: string; platformId: string; saved: boolean }>>(() => {
    const map: Record<string, { alias: string; platformId: string; saved: boolean }> = {};
    for (const name of teamNames) {
      const existing = initialMappings.find((m) => m.liquipediaName === name);
      map[name] = {
        alias: existing?.alias ?? "",
        platformId: existing?.platformId ?? "",
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
          alias: entry.alias,
          platformId: entry.platformId
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

  function handleChange(name: string, field: "alias" | "platformId", value: string) {
    setMappings((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: value, saved: false }
    }));
  }

  const sorted = [...teamNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="border-b border-slate-200 py-2 pr-4">Liquipedia имя</th>
            <th className="border-b border-slate-200 py-2 pr-4 w-[240px]">Каноническое / альт. имя</th>
            <th className="border-b border-slate-200 py-2 pr-4 w-[160px]">Platform ID (ОБЯЗАТЕЛЬНО)</th>
            <th className="border-b border-slate-200 py-2 pr-4 w-[120px]"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((name) => {
            const entry = mappings[name] ?? { alias: "", platformId: "", saved: false };
            const isSaving = saving === name;
            return (
              <tr key={name}>
                <td className="border-b border-slate-100 py-2 pr-4 font-medium text-slate-950">{name}</td>
                <td className="border-b border-slate-100 py-2 pr-4">
                  <input
                    type="text"
                    value={entry.alias}
                    onChange={(e) => handleChange(name, "alias", e.target.value)}
                    placeholder="необязательно"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="border-b border-slate-100 py-2 pr-4">
                  <input
                    type="text"
                    value={entry.platformId}
                    onChange={(e) => handleChange(name, "platformId", e.target.value)}
                    placeholder="ОБЯЗАТЕЛЬНО"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="border-b border-slate-100 py-2 pr-4">
                  <button
                    onClick={() => handleSave(name)}
                    disabled={isSaving || entry.saved}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      entry.saved
                        ? "bg-green-50 text-green-600 border border-green-200"
                        : isSaving
                        ? "bg-slate-100 text-slate-400"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {isSaving ? "..." : entry.saved ? "✓" : "Сохранить"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
