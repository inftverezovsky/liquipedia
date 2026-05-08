"use client";

import React, { useState } from "react";

export function AdminTeamImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [discipline, setDiscipline] = useState("dota2");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("disciplineSlug", discipline);

    try {
      const response = await fetch("/api/admin-teams/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload");
      }

      setResult(data);
      setStatus("success");
    } catch (err: any) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="p-8 bg-white/40 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl overflow-hidden relative group">
      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
        <svg className="w-24 h-24 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <div className="relative z-10">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 mb-2">Database Tools</p>
        <h2 className="text-3xl font-black tracking-tighter text-slate-900 mb-6">
          Импорт команд <span className="text-indigo-600">Excel.</span>
        </h2>
        
        <p className="text-sm font-bold text-slate-600 mb-8 max-w-lg leading-relaxed">
          Загрузите список команд из административной системы для автоматического сопоставления. 
          Файл должен содержать колонки с <span className="text-indigo-600">ID</span> и <span className="text-indigo-600">Названием</span> команды.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-4">Дисциплина</label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="w-full h-14 px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="dota2">Dota 2</option>
              <option value="counterstrike">Counter-Strike</option>
              <option value="valorant">Valorant</option>
              <option value="leagueoflegends">League of Legends</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-4">Файл (.xlsx)</label>
            <div className="relative h-14">
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <div className="absolute inset-0 flex items-center px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-400 group-hover:border-indigo-200 transition-all pointer-events-none">
                {file ? (
                  <span className="text-slate-900 truncate">{file.name}</span>
                ) : (
                  "Выберите файл..."
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || status === "uploading"}
          className={`
            h-16 px-12 rounded-2xl font-black text-sm uppercase tracking-widest transition-all
            ${!file || status === "uploading" 
              ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
              : "bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0"
            }
          `}
        >
          {status === "uploading" ? (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Загрузка...
            </div>
          ) : "Загрузить и сопоставить"}
        </button>

        {status === "success" && result && (
          <div className="mt-8 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 text-emerald-700 mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-black uppercase tracking-wider text-xs">Успешно импортировано</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-600/60 mb-1">Команд в файле</p>
                <p className="text-2xl font-black text-emerald-900">{result.importedCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-600/60 mb-1">Авто-маппинг</p>
                <p className="text-2xl font-black text-emerald-900">{result.mappingResult.autoMappedCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-600/60 mb-1">Неоднозначно</p>
                <p className="text-2xl font-black text-emerald-900">{result.mappingResult.ambiguousCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-600/60 mb-1">Не найдено</p>
                <p className="text-2xl font-black text-emerald-900">{result.mappingResult.unmappedCount}</p>
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8 p-6 bg-rose-50 border-2 border-rose-100 rounded-2xl animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 text-rose-700 mb-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-black uppercase tracking-wider text-xs">Ошибка импорта</span>
            </div>
            <p className="text-sm font-bold text-rose-900">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
