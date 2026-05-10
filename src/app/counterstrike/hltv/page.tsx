"use client";

import { useMemo, useState, useEffect } from "react";
import { Clock, Shield, AlertCircle, FileJson, FileCode, CheckCircle2, RotateCcw, Users, Eye, Image as ImageIcon } from "lucide-react";
import { toPhpString } from "@/lib/adminUpload/utils";
import { parseHltvCopiedText } from "@/lib/hltv/manualTextParser";
import TeamMappingPanel from "@/components/TeamMappingPanel";

interface HltvMatch {
  id: string;
  tournament: string;
  team1: {
    name: string;
    platformId: string | null;
  };
  team2: {
    name: string;
    platformId: string | null;
  };
  date: string;
  isReady: boolean;
  isLive?: boolean;
}

type HltvExportPayload = {
  shapka: number;
  sport: number;
  max: number;
  match: Array<{
    date: string;
    team1: number;
    team2: number;
  }>;
};

type MatchGroup = {
  tournament: string;
  matches: HltvMatch[];
  firstMatchTime: number;
};

const UNKNOWN_DATE_TIME = Number.MAX_SAFE_INTEGER;

function getTeamNameValue(team: unknown) {
  if (team && typeof team === "object" && "name" in team) {
    return String((team as { name?: string }).name || "TBD");
  }

  return String(team || "TBD");
}

function formatMatchCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "матч"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "матча"
      : "матчей";

  return `${count} ${word}`;
}

function parseMatchDateTime(date: string) {
  if (!date) return UNKNOWN_DATE_TIME;

  const normalized = date.trim();
  const ruMatch = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (ruMatch) {
    const [, day, month, year, hour, minute, second = "00"] = ruMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime();
    return Number.isNaN(parsed) ? UNKNOWN_DATE_TIME : parsed;
  }

  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? UNKNOWN_DATE_TIME : parsed;
}

function groupMatchesByTournament(matches: HltvMatch[]): MatchGroup[] {
  const sortedMatches = [...matches].sort((a, b) => {
    const dateDelta = parseMatchDateTime(a.date) - parseMatchDateTime(b.date);
    if (dateDelta !== 0) return dateDelta;
    const tournamentDelta = a.tournament.localeCompare(b.tournament, "ru");
    if (tournamentDelta !== 0) return tournamentDelta;
    return `${a.team1.name} ${a.team2.name}`.localeCompare(`${b.team1.name} ${b.team2.name}`, "ru");
  });

  const groups = new Map<string, HltvMatch[]>();
  for (const match of sortedMatches) {
    const tournament = match.tournament?.trim() || "Без турнира";
    groups.set(tournament, [...(groups.get(tournament) ?? []), match]);
  }

  return Array.from(groups.entries())
    .map(([tournament, groupMatches]) => ({
      tournament,
      matches: groupMatches,
      firstMatchTime: Math.min(...groupMatches.map((match) => parseMatchDateTime(match.date))),
    }))
    .sort((a, b) => {
      const dateDelta = a.firstMatchTime - b.firstMatchTime;
      if (dateDelta !== 0) return dateDelta;
      return a.tournament.localeCompare(b.tournament, "ru");
    });
}

export default function HltvMatchesPage() {
  const [activeTab, setActiveTab] = useState<"matches" | "teams">("matches");
  const [matches, setMatches] = useState<HltvMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showManualImport, setShowManualImport] = useState(false);
  const [manualContent, setManualContent] = useState("");
  const [allMappings, setAllMappings] = useState<any[]>([]);
  const [sportId, setSportId] = useState("2");
  const [previewMatches, setPreviewMatches] = useState<any[]>([]);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);

  // Admin Upload States
  const [adminShapkaId, setAdminShapkaId] = useState("");
  const [adminMax, setAdminMax] = useState("5000");
  const [apiUrl, setApiUrl] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ type: 'success' | 'error'; text: string; raw?: string } | null>(null);
  const [isEditingShapka, setIsEditingShapka] = useState(false);
  const groupedMatches = useMemo(() => groupMatchesByTournament(matches), [matches]);
  const groupedPreviewMatches = useMemo(
    () => groupMatchesByTournament(previewMatches.map((match: any) => ({
      id: match.id || `${match.tournament || "manual"}-${match.team1}-${match.team2}-${match.date}`,
      tournament: match.tournament || "HLTV Import",
      team1: { name: getTeamNameValue(match.team1), platformId: null },
      team2: { name: getTeamNameValue(match.team2), platformId: null },
      date: match.date,
      isReady: false,
    }))),
    [previewMatches]
  );
  const orderedPreviewMatches = useMemo(
    () => groupedPreviewMatches.flatMap(group => group.matches),
    [groupedPreviewMatches]
  );

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin-settings/counterstrike");
      const data = await res.json();
      if (data.adminSportId) setSportId(data.adminSportId);
      if (data.defaultShapkaId) setAdminShapkaId(data.defaultShapkaId);
      if (data.adminMax) setAdminMax(data.adminMax);
      if (data.apiUrl) setApiUrl(data.apiUrl);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    }
  };

  const fetchMappings = async () => {
    try {
      const res = await fetch("/api/team-mapping?discipline=counterstrike");
      const data = await res.json();
      setAllMappings(data.mappings || []);
    } catch (err) {
      console.error("Failed to fetch mappings", err);
    }
  };

  const fetchMatches = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/counterstrike/hltv/matches${force ? "?force=true" : ""}`);
      const data = await res.json();
      if (data.ok) {
        setMatches(data.matches);
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
    fetchSettings();
  }, []);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const getExportData = () => {
    const selectedMatches = matches
      .filter(m => selectedIds.has(m.id))
      .sort((a, b) => parseMatchDateTime(a.date) - parseMatchDateTime(b.date));
    if (selectedMatches.length === 0) return null;

    return {
      shapka: parseInt(adminShapkaId || "0"), 
      sport: parseInt(sportId),
      max: parseInt(adminMax || "5000"),
      match: selectedMatches.map(m => ({
        date: m.date,
        team1: parseInt(m.team1.platformId || "0"),
        team2: parseInt(m.team2.platformId || "0")
      }))
    };
  };

  const openRawDataPage = (content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");

    if (!opened) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }

    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  };

  const toCsvString = (data: HltvExportPayload) => {
    const escapeCsv = (value: string | number) => {
      const raw = String(value);
      return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };

    const rows = [
      ["shapka", "sport", "max", "date", "team1", "team2"],
      ...data.match.map((match) => [
        data.shapka,
        data.sport,
        data.max,
        match.date,
        match.team1,
        match.team2,
      ]),
    ];

    return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  };

  const openExportPage = (format: "json" | "csv" | "php") => {
    const data = getExportData();
    if (!data) return;

    const content = format === "json"
      ? JSON.stringify(data, null, 2)
      : format === "csv"
        ? toCsvString(data)
        : toPhpString(data);

    openRawDataPage(content);
  };

  const handleSendToAdmin = async () => {
    const payload = getExportData();
    if (!payload) return;
    if (!confirm(`Отправить ${payload.match.length} матчей в админ-панель?`)) return;

    setActionLoading(true);
    setUploadResult(null);

    try {
      const res = await fetch('/api/counterstrike/hltv/admin-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload })
      });
      const data = await res.json();
      if (data.ok) {
        setUploadResult({ 
          type: 'success', 
          text: `Данные успешно залиты. Статус: ${data.status}`,
          raw: data.rawResponse
        });
      } else {
        setUploadResult({ 
          type: 'error', 
          text: data.error || 'Ошибка при заливке',
          raw: data.rawResponse
        });
      }
    } catch (e) {
      setUploadResult({ type: 'error', text: 'Сетевая ошибка при отправке' });
    } finally {
      setActionLoading(false);
    }
  };

  const [mappingTeam, setMappingTeam] = useState<{name: string, platformId: string | null} | null>(null);
  const [newPlatformId, setNewPlatformId] = useState("");

  // OCR: paste image -> extract text -> put into textarea
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) processOcr(file);
        return;
      }
    }
  };

  const processOcr = async (file: File) => {
    setIsProcessingOcr(true);
    setPreviewMatches([]);
    try {
      const { recognize } = await import("tesseract.js");
      const { data: { text } } = await recognize(file, 'eng+rus', {
        logger: m => console.log('[OCR]', m)
      });
      console.log('[OCR] Raw result:', text);
      // Put raw OCR text into the textarea — user will click Preview
      setManualContent(text);
    } catch (err: any) {
      console.error('[OCR] Error:', err);
      alert('Ошибка распознавания: ' + err.message);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Also support JSON (from console script) and HTML
  const parseContent = (text: string) => {
    const content = text.trim();

    // 1. Try JSON
    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        const json = JSON.parse(content);
        return json.matches || (Array.isArray(json) ? json : []);
      } catch (e) {}
    }

    // 2. Try plain text (HLTV copy-paste)
    return parseHltvCopiedText(content);
  };

  // Preview button handler
  const handlePreview = () => {
    const content = manualContent.trim();
    if (!content) return;

    const parsed = parseContent(content);

    if (parsed.length > 0) {
      setPreviewMatches(parsed);
    } else {
      alert("Не удалось распознать матчи из текста.");
    }
  };

  // Import button handler 
  const handleManualImport = async () => {
    try {
      // Use preview if available, otherwise parse now
      let parsedMatches = previewMatches.length > 0 
        ? orderedPreviewMatches.map(match => ({
            id: match.id,
            tournament: match.tournament,
            team1: match.team1.name,
            team2: match.team2.name,
            date: match.date,
          }))
        : parseContent(manualContent);

      if (parsedMatches.length === 0) {
        alert("Нет матчей для импорта. Сначала нажмите 'Предпросмотр'.");
        return;
      }

      const res = await fetch('/api/counterstrike/hltv/matches/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: parsedMatches })
      });
      const data = await res.json();
      if (data.ok) {
        setMatches(data.matches);
        setShowManualImport(false);
        setManualContent("");
        setPreviewMatches([]);
      }
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    }
  };

  const openMapping = (team: {name: string, platformId: string | null}, e: React.MouseEvent) => {
    e.stopPropagation();
    setMappingTeam(team);
    setNewPlatformId(team.platformId || "");
  };

  const saveMapping = async () => {
    if (!mappingTeam) return;
    try {
      const res = await fetch("/api/team-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liquipediaName: mappingTeam.name,
          disciplineSlug: "counterstrike",
          platformId: newPlatformId,
          status: 'manual_mapped',
          isManual: true
        })
      });
      if (res.ok) {
        const resMatches = await fetch('/api/counterstrike/hltv/matches');
        const data = await resMatches.json();
        if (data.ok) setMatches(data.matches);
        setMappingTeam(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const exportToCsv = () => {
    openExportPage("csv");
  };

  const exportToPhp = () => {
    openExportPage("php");
  };

  const exportToJson = () => {
    openExportPage("json");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="h-12 w-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
        <p className="text-slate-500 font-medium animate-pulse">Загрузка матчей HLTV...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">
            HLTV <span className="text-indigo-600">Matches</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Синхронизация данных из HLTV</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchMatches(matches.length > 0)}
            disabled={loading}
            title={matches.length > 0 ? "Обновить данные" : "Загрузить данные"}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            <RotateCcw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            {matches.length > 0 ? "Обновить" : "Загрузить"}
          </button>
          <button 
            onClick={() => setShowManualImport(true)}
            className="flex items-center gap-4 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
          >
            <ImageIcon className="w-5 h-5" />
            Ручной импорт
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl w-max">
        <button
          onClick={() => setActiveTab("matches")}
          className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === "matches" ? "bg-white text-indigo-600 shadow-md" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          Матчи
        </button>
        <button
          onClick={() => setActiveTab("teams")}
          className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === "teams" ? "bg-white text-indigo-600 shadow-md" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Users className="w-4 h-4" />
          База команд
        </button>
      </div>

      {activeTab === "matches" && (
        <div className="grid gap-6 md:grid-cols-12 animate-in">
          {/* Admin Panels */}
          <div className="md:col-span-4 space-y-6">
            {/* Export Panel */}
            <div className="premium-card p-8 bg-white border-slate-200 shadow-sm rounded-[2.5rem]">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Экспорт данных</h3>
              <div className="grid grid-cols-3 gap-3">
                <button 
                  disabled={selectedIds.size === 0}
                  onClick={exportToJson}
                  className="h-14 rounded-2xl border border-slate-200 font-black text-[10px] uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-30"
                >
                  JSON
                </button>
                <button 
                  disabled={selectedIds.size === 0}
                  onClick={exportToCsv}
                  className="h-14 rounded-2xl border border-slate-200 font-black text-[10px] uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-30"
                >
                  CSV
                </button>
                <button 
                  disabled={selectedIds.size === 0}
                  onClick={exportToPhp}
                  className="h-14 rounded-2xl border border-slate-200 font-black text-[10px] uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-30"
                >
                  PHP
                </button>
              </div>
            </div>

            {/* Admin Upload Panel */}
            <div className="premium-card p-8 bg-white border-slate-200 shadow-sm rounded-[2.5rem] space-y-8 sticky top-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Заливка в админ</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Настройте ID шапки и нажмите кнопку «Залить».</p>
              </div>
              
              <div className="space-y-6">
                {/* Shapka ID Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">ID Шапки Турнира</label>
                    {!isEditingShapka ? (
                      <button 
                        onClick={() => setIsEditingShapka(true)}
                        className="text-[10px] font-black text-slate-600 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        Изменить
                      </button>
                    ) : (
                      <button 
                        onClick={() => setIsEditingShapka(false)}
                        className="text-[10px] font-black text-emerald-600 uppercase tracking-widest transition-colors"
                      >
                        Готово
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      disabled={!isEditingShapka}
                      className={`flex-1 h-14 rounded-2xl px-6 text-sm font-bold transition-all ${
                        !isEditingShapka 
                          ? 'bg-slate-50 border border-slate-100 text-slate-400 cursor-not-allowed' 
                          : 'bg-white border border-slate-200 text-slate-950 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 outline-none'
                      }`}
                      placeholder="Введите ID..."
                      value={adminShapkaId}
                      onChange={(e) => setAdminShapkaId(e.target.value)}
                    />
                    {!isEditingShapka && (
                      <div className="flex-none w-14 h-14 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Action Button */}
                <button
                  onClick={handleSendToAdmin}
                  disabled={actionLoading || !adminShapkaId || selectedIds.size === 0}
                  className="w-full h-20 rounded-[1.5rem] bg-slate-50/50 backdrop-blur-sm border border-slate-200 text-slate-400 font-black uppercase tracking-[0.2em] text-xs hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-30 disabled:grayscale"
                >
                  {actionLoading ? "Отправка..." : "ЗАЛИТЬ"}
                </button>

                {uploadResult && (
                  <div className={`p-5 rounded-2xl border text-xs font-bold leading-relaxed ${
                    uploadResult.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${uploadResult.type === 'success' ? 'bg-emerald-200' : 'bg-rose-200'}`}>
                        {uploadResult.type === 'success' ? '✓' : '!'}
                      </div>
                      {uploadResult.text}
                    </div>
                    {uploadResult.raw && (
                      <details className="mt-3 group">
                        <summary className="cursor-pointer opacity-40 uppercase text-[9px] tracking-widest list-none flex items-center gap-1">
                          <svg className="h-2 w-2 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M9 5l7 7-7 7" /></svg>
                          Технический ответ
                        </summary>
                        <pre className="mt-2 p-3 bg-white/50 rounded-xl overflow-auto max-h-32 text-[9px] font-mono whitespace-pre-wrap text-slate-500">
                          {uploadResult.raw}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* PHP Code Preview Tooltip-like area */}
              {selectedIds.size > 0 && (
                <div className="pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PHP Preview</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(toPhpString(getExportData()!))}
                      className="text-[10px] font-black text-indigo-600 hover:underline"
                    >
                      COPY CODE
                    </button>
                  </div>
                  <pre className="p-5 bg-slate-900 rounded-[1.5rem] text-[10px] font-mono text-emerald-400/70 overflow-x-auto max-h-60 scrollbar-hide leading-relaxed">
                    {toPhpString(getExportData())}
                  </pre>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="space-y-8">
                {groupedMatches.map((group) => (
                  <section key={group.tournament} className="space-y-4">
                    <div className="sticky top-4 z-10 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                          {group.tournament}
                        </h2>
                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {formatMatchCount(group.matches.length)} • сортировка по дате
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {group.firstMatchTime === UNKNOWN_DATE_TIME ? "Дата TBD" : group.matches[0].date.split(" ")[0]}
                      </span>
                    </div>

                    <div className="grid gap-4">
                      {group.matches.map((match) => (
                        <div
                          key={match.id}
                          onClick={() => toggleSelection(match.id)}
                          className={`group relative flex flex-col rounded-[2rem] border p-6 transition-all cursor-pointer overflow-hidden bg-white ${
                            selectedIds.has(match.id) ? "border-indigo-600 ring-1 ring-indigo-600/10" : "border-slate-200 hover:border-indigo-300 shadow-sm"
                          }`}
                        >
                          <div className="flex items-center justify-end mb-4">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-slate-900 tabular-nums flex items-center gap-2">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {match.date}
                              </span>
                              <div className={`h-5 w-5 rounded-md border transition-all flex items-center justify-center ${
                                selectedIds.has(match.id) ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200"
                              }`}>
                                {selectedIds.has(match.id) && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-12">
                            <div 
                              className="flex-1 text-right group/team cursor-help"
                              onClick={(e) => openMapping(match.team1, e)}
                            >
                              <div className="text-xl font-bold text-slate-900 group-hover/team:text-indigo-600 transition-colors">{match.team1.name}</div>
                              <div className={`text-[9px] font-black mt-1 px-2 py-0.5 rounded-full inline-block ${match.team1.platformId ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' : 'bg-rose-50 text-rose-400 border border-rose-100'}`}>
                                {match.team1.platformId ? `ID: ${match.team1.platformId}` : 'CLICK TO MAP'}
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-center">
                              <div className="rounded-full bg-slate-50 border border-slate-100 px-3 py-1 text-[8px] font-bold text-slate-300 uppercase tracking-[0.3em]">VS</div>
                            </div>

                            <div 
                              className="flex-1 text-left group/team cursor-help"
                              onClick={(e) => openMapping(match.team2, e)}
                            >
                              <div className="text-xl font-bold text-slate-900 group-hover/team:text-indigo-600 transition-colors">{match.team2.name}</div>
                              <div className={`text-[9px] font-black mt-1 px-2 py-0.5 rounded-full inline-block ${match.team2.platformId ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' : 'bg-rose-50 text-rose-400 border border-rose-100'}`}>
                                {match.team2.platformId ? `ID: ${match.team2.platformId}` : 'CLICK TO MAP'}
                              </div>
                            </div>
                          </div>

                          {!match.isReady && (
                            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-rose-500 bg-rose-50/50 rounded-xl px-3 py-2 border border-rose-100/50">
                              <AlertCircle className="w-3 h-3" />
                              ОДНА ИЛИ ОБЕ КОМАНДЫ НЕ ПРИВЯЗАНЫ К ID ПЛАТФОРМЫ
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                {groupedMatches.length === 0 && (
                  <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Нет матчей для отображения</p>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="animate-in">
          <TeamMappingPanel 
            disciplineSlug="counterstrike"
            initialMappings={allMappings}
            teamNames={Array.from(new Set(matches.flatMap(m => [m.team1.name, m.team2.name])))}
          />
        </div>
      )}

      {/* Manual Import Modal */}
      {showManualImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div 
            onPaste={handlePaste}
            className="bg-white rounded-[2.5rem] p-10 max-w-2xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]"
          >
            <h3 className="text-2xl font-black text-slate-900 mb-2">Импорт матчей</h3>
            <p className="text-slate-500 font-medium mb-6">
              Вставьте текст с HLTV или скриншот (Ctrl+V). После вставки нажмите «Предпросмотр».
            </p>

            {/* OCR drop zone */}
            {isProcessingOcr && (
              <div className="mb-4 p-6 rounded-2xl bg-indigo-50 border-2 border-dashed border-indigo-300 flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Распознаю текст на скриншоте...</p>
              </div>
            )}

            {!isProcessingOcr && !manualContent && (
              <div className="mb-4 p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center gap-3 hover:border-indigo-300 transition-colors">
                <ImageIcon className="w-8 h-8 text-slate-300" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Можно вставить скриншот (Ctrl+V)</p>
              </div>
            )}
            
            <textarea 
              value={manualContent}
              onChange={(e) => { setManualContent(e.target.value); setPreviewMatches([]); }}
              placeholder={"Вставьте сюда текст с HLTV (Ctrl+V)\n\nПример:\nSaturday - 2026-05-09\n17:00\nbo3\nNemiga\nNemiga\nINOX Division\nINOX Division"}
              className="w-full h-48 rounded-2xl bg-slate-50 border border-slate-200 p-6 font-mono text-xs text-slate-600 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none resize-none"
            />

            {/* Preview PHP button */}
            <div className="flex gap-3 pt-4">
              <button 
                onClick={handlePreview}
                disabled={!manualContent}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                Предпросмотр
              </button>
            </div>

            {/* Preview results */}
            {previewMatches.length > 0 && (
              <div className="mt-6 space-y-4">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  ✓ Распознано матчей: {previewMatches.length}
                </p>
                {groupedPreviewMatches.map((group) => (
                  <section key={group.tournament} className="space-y-2">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
                      <span className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                        {group.tournament}
                      </span>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {formatMatchCount(group.matches.length)}
                      </span>
                    </div>

                    {group.matches.map((m, i) => (
                      <div key={m.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200">
                        <span className="text-xs font-bold text-slate-400 tabular-nums w-8">{i + 1}.</span>
                        <span className="text-sm font-bold text-slate-900 flex-1 text-right">{m.team1.name}</span>
                        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">vs</span>
                        <span className="text-sm font-bold text-slate-900 flex-1">{m.team2.name}</span>
                        <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{m.date}</span>
                      </div>
                    ))}
                  </section>
                ))}

                {/* PHP Preview */}
                <div className="mt-4 p-4 bg-slate-900 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">PHP Структура:</p>
                  <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
{toPhpString({
  shapka: 0,
  sport: parseInt(sportId),
  max: 5000,
  match: orderedPreviewMatches.map(m => ({
    date: m.date,
    team1: 0,
    team2: 0
  }))
})}
                  </pre>
                  <p className="text-[9px] text-slate-500 mt-2 italic">* team1/team2 покажут реальные ID после привязки команд</p>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-8">
              <button 
                onClick={() => { setShowManualImport(false); setPreviewMatches([]); }}
                className="flex-1 h-14 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all"
              >
                Отмена
              </button>
              <button 
                onClick={handleManualImport}
                disabled={previewMatches.length === 0}
                className="flex-1 h-14 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                Импортировать ({previewMatches.length} матчей)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Modal */}
      {mappingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100">
            <h3 className="text-2xl font-black text-slate-900 mb-2">Map Team</h3>
            <p className="text-slate-500 font-medium mb-6">Укажите Platform ID для команды <span className="text-indigo-600 font-bold">{mappingTeam.name}</span></p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Platform ID</label>
                <input 
                  type="text"
                  autoFocus
                  value={newPlatformId}
                  onChange={(e) => setNewPlatformId(e.target.value)}
                  placeholder="Напр. 12345"
                  className="w-full h-14 rounded-2xl bg-slate-50 border border-slate-100 px-6 font-bold text-slate-900 focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setMappingTeam(null)}
                  className="flex-1 h-14 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Отмена
                </button>
                <button 
                  onClick={saveMapping}
                  className="flex-1 h-14 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
