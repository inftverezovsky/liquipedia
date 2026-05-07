"use client";

import { useState } from "react";
import { generateInternalTeamId } from "@/lib/teams";

type TeamMappingRecord = {
  id: string;
  liquipediaName: string;
  alias: string | null;
  canonicalName: string | null;
  platformId: string | null;
  logoUrl?: string | null;
  confidenceScore: number | null;
  status: string;
  matchMethod: string | null;
  isManual: boolean;
  isLockedFromAutoMapping: boolean;
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
  const [mappings, setMappings] = useState<Record<string, Partial<TeamMappingRecord> & { saved: boolean }>>(() => {
    const map: Record<string, Partial<TeamMappingRecord> & { saved: boolean }> = {};
    for (const name of teamNames) {
      const existing = initialMappings.find((m) => m.liquipediaName === name);
      map[name] = {
        ...existing,
        saved: !!existing?.platformId || existing?.status === 'manual_unmapped'
      };
    }
    return map;
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  async function handleSave(name: string) {
    setSaving(name);
    try {
      const entry = mappings[name];
      const res = await fetch("/api/team-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liquipediaName: name,
          disciplineSlug,
          alias: entry.alias,
          canonicalName: entry.canonicalName,
          platformId: entry.platformId,
          status: 'manual_mapped',
          isManual: true,
          isLockedFromAutoMapping: true
        })
      });
      const data = await res.json();
      setMappings((prev) => ({
        ...prev,
        [name]: { ...data.mapping, saved: true }
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
        [name]: { 
          ...prev[name],
          platformId: null,
          canonicalName: null,
          alias: null,
          status: 'manual_unmapped',
          matchMethod: null,
          confidenceScore: null,
          saved: true 
        }
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  async function handleAutoMapSingle(name: string) {
    setSaving(name);
    try {
      const res = await fetch("/api/team-mapping/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disciplineSlug, liquipediaName: name })
      });
      const data = await res.json();
      if (data.mapping) {
        setMappings((prev) => ({
          ...prev,
          [name]: { ...data.mapping, saved: true }
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  async function handleAutoMapAll() {
    if (!confirm(`Запустить авто-маппинг для всех неразмеченных команд ${disciplineSlug}?`)) return;
    setGlobalLoading(true);
    try {
      await fetch("/api/team-mapping/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disciplineSlug })
      });
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  function handleChange(name: string, field: "canonicalName" | "platformId", value: string) {
    setMappings((prev) => ({
      ...prev,
      [name]: { ...prev[name], [field]: value, saved: false }
    }));
  }

  const sorted = [...teamNames].sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 p-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Синхронизация команд</h3>
          <p className="text-sm font-medium text-slate-500">Настройте соответствие имен Liquipedia вашим внутренним Platform ID.</p>
        </div>
        <button
          onClick={handleAutoMapAll}
          disabled={globalLoading}
          className="btn-primary"
        >
          {globalLoading ? 'Обработка...' : 'Авто-маппинг всех'}
        </button>
      </div>
      
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              <tr>
                <th className="py-4 px-6">Liquipedia Team</th>
                <th className="py-4 px-6">Internal ID</th>
                <th className="py-4 px-6">Canonical Name</th>
                <th className="py-4 px-6">Platform ID</th>
                <th className="py-4 px-6">Status / Method</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((name) => {
                const entry = mappings[name] ?? { platformId: "", canonicalName: "", saved: false };
                const isSaving = saving === name;
                const internalId = generateInternalTeamId(name);
                
                return (
                  <tr key={name} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{name}</span>
                    </td>
                    <td className="py-4 px-6 font-mono text-[10px] text-slate-400">
                      {internalId}
                    </td>
                    <td className="py-4 px-6">
                      <input
                        type="text"
                        value={entry.canonicalName || ""}
                        onChange={(e) => handleChange(name, "canonicalName", e.target.value)}
                        placeholder="—"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <input
                        type="text"
                        value={entry.platformId || ""}
                        onChange={(e) => handleChange(name, "platformId", e.target.value)}
                        placeholder="—"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-indigo-600 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none tabular-nums"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-max items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter
                          ${entry.status === 'auto_mapped' ? 'bg-indigo-50 text-indigo-600' : 
                            entry.status === 'manual_mapped' ? 'bg-emerald-50 text-emerald-600' :
                            entry.status === 'manual_unmapped' ? 'bg-rose-50 text-rose-600' :
                            entry.status === 'ambiguous' ? 'bg-amber-50 text-amber-600' :
                            'bg-slate-100 text-slate-400'}`}
                        >
                          {entry.status || 'unmapped'}
                        </span>
                        {entry.confidenceScore != null && (
                          <span className="text-[9px] font-bold text-slate-400">
                            {entry.confidenceScore.toFixed(1)}% via {entry.matchMethod}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSave(name)}
                          disabled={isSaving || entry.saved}
                          className={`min-w-[100px] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            entry.saved
                              ? "text-slate-300 bg-slate-50 cursor-default"
                              : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                          }`}
                        >
                          {isSaving ? "..." : entry.saved ? "Saved" : "Save"}
                        </button>
                        <button
                          onClick={() => handleAutoMapSingle(name)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title="Auto-map"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(name)}
                          disabled={isSaving}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
