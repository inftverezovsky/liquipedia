'use client';

import { useState, useEffect } from 'react';

interface AdminMapping {
  adminShapkaId: string;
  adminShapkaName: string;
}

interface Settings {
  apiUrl: string;
  adminSportId: string;
  adminMax: string;
  defaultShapkaId: string;
  timezone: string;
  dateFormat: string;
  requestMode: string;
}

interface PreviewData {
  phpArray: any;
  serialized: string;
  postBody: string;
  readyMatchesCount: number;
  skippedMatches: any[];
  warnings: string[];
}

function toPhpString(obj: any, indent: number = 0): string {
  const spaces = ' '.repeat(indent);
  const innerSpaces = ' '.repeat(indent + 4);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return 'Array\n' + spaces + '(\n' + spaces + ')';
    const items = obj.map((v, i) => `${innerSpaces}[${i}] => ${toPhpString(v, indent + 4)}`).join('\n');
    return `Array\n${spaces}(\n${items}\n${spaces})`;
  } else if (typeof obj === 'object' && obj !== null) {
    const items = Object.entries(obj).map(([k, v]) => `${innerSpaces}[${k}] => ${toPhpString(v, indent + 4)}`).join('\n');
    return `Array\n${spaces}(\n${items}\n${spaces})`;
  }
  return String(obj);
}

export default function AdminUploadPanel({ 
  tournamentId, 
  disciplineSlug,
  tournamentName,
  selectedMatchIds = []
}: { 
  tournamentId: string; 
  disciplineSlug: string;
  tournamentName: string;
  selectedMatchIds?: string[];
}) {
  const [mapping, setMapping] = useState<AdminMapping>({ adminShapkaId: '', adminShapkaName: '' });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; text: string; raw?: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mappingRes, settingsRes] = await Promise.all([
          fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/admin-mapping`),
          fetch(`/api/admin-settings/${disciplineSlug}`)
        ]);
        
        const mappingData = await mappingRes.json();
        const settingsData = await settingsRes.json();
        
        setMapping({
          adminShapkaId: mappingData.adminShapkaId || '',
          adminShapkaName: mappingData.adminShapkaName || '',
        });
        setLastSavedId(mappingData.adminShapkaId || '');
        setSettings(settingsData);
      } catch (e) {
        console.error('Failed to fetch admin data', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    const handleTrigger = () => handlePreview();
    window.addEventListener('trigger-admin-preview', handleTrigger);
    return () => window.removeEventListener('trigger-admin-preview', handleTrigger);
  }, [tournamentId, disciplineSlug]);

  const handleSaveMapping = async () => {
    setActionLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/admin-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...mapping,
          disciplineSlug,
          sourceTournamentName: tournamentName
        }),
      });
      if (res.ok) {
        setLastSavedId(mapping.adminShapkaId);
        setIsEditing(false);
      }
    } catch (e) {
      setResult({ type: 'error', text: 'Ошибка сохранения ID' });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreview = async () => {
    setActionLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/admin-fixt-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplineSlug, selectedMatchIds }),
      });
      const data = await res.json();
      if (data.ok) {
        setPreview(data);
      } else {
        setResult({ type: 'error', text: data.error || 'Ошибка превью' });
      }
    } catch (e) {
      setResult({ type: 'error', text: 'Ошибка превью' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    if (!confirm('Залить данные в API?')) return;
    setActionLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/${disciplineSlug}/tournament/${tournamentId}/admin-fixt-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplineSlug, selectedMatchIds }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ 
          type: 'success', 
          text: `Данные успешно залиты в платформу. Статус: ${data.status}`,
          raw: data.rawResponse 
        });
        // Dispatch custom event to refresh MatchList history
        window.dispatchEvent(new CustomEvent('admin-upload-success'));
      } else {
        setResult({ 
          type: 'error', 
          text: data.error || 'Ошибка при заливке',
          raw: data.rawResponse 
        });
      }
    } catch (e) {
      setResult({ type: 'error', text: 'Сетевая ошибка при отправке' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-400 font-normal animate-pulse">Загрузка данных админки...</div>;

  const effectiveShapkaId = mapping.adminShapkaId || settings?.defaultShapkaId;
  const isShapkaOverride = !!mapping.adminShapkaId;
  const isSaved = mapping.adminShapkaId !== '' && mapping.adminShapkaId === lastSavedId;

  return (
    <div className="space-y-6">
      <section className="premium-card p-8 bg-white border-slate-200 shadow-sm">
        <div className="mb-8 border-b border-slate-100 pb-6">
          <h3 className="text-2xl font-medium text-slate-900 tracking-tight">Заливка в админ</h3>
          <p className="mt-1 text-sm font-normal text-slate-500">Настройте ID шапки и нажмите кнопку «Залить».</p>
        </div>
        
        <div className="space-y-8">
          {/* Shapka ID Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">ID Шапки Турнира</label>
              {(isSaved && !isEditing) && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-medium text-slate-600 hover:text-slate-700 uppercase tracking-widest flex items-center gap-1"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Изменить
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-stretch">
              <input
                type="text"
                disabled={isSaved && !isEditing}
                className={`flex-1 min-w-[120px] min-h-[52px] rounded-xl border px-4 py-3 text-sm font-normal transition-all ${
                  isSaved && !isEditing 
                    ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-white border-slate-200 text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-800/5 focus:border-slate-800'
                }`}
                placeholder={settings?.defaultShapkaId ? `ID: ${settings.defaultShapkaId}` : "Введите ID..."}
                value={mapping.adminShapkaId}
                onChange={(e) => setMapping({ ...mapping, adminShapkaId: e.target.value })}
              />
              {(!isSaved || isEditing) && (
                <button
                  onClick={handleSaveMapping}
                  disabled={actionLoading}
                  className={`flex-none min-h-[52px] px-6 rounded-xl font-medium text-[9px] uppercase tracking-widest transition-all duration-300 disabled:opacity-50 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200`}
                >
                  СОХРАНИТЬ ID
                </button>
              )}
              {(isSaved && !isEditing) && (
                <div className="flex-none min-h-[52px] px-6 rounded-xl font-medium text-[9px] uppercase tracking-widest bg-emerald-500/5 backdrop-blur-sm text-emerald-600 border border-emerald-500/20 flex items-center justify-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ГОТОВО
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
            <button
              onClick={handleSend}
              disabled={actionLoading || !settings?.apiUrl || !effectiveShapkaId || !settings?.adminSportId || (preview?.readyMatchesCount === 0)}
              className="flex-1 min-h-[64px] rounded-2xl bg-slate-500/5 backdrop-blur-sm text-slate-600 font-medium text-sm uppercase tracking-widest border border-slate-200/50 hover:bg-slate-500/10 transition-all disabled:opacity-50 disabled:grayscale"
            >
              ЗАЛИТЬ
            </button>
          </div>
        </div>

        {result && (
          <div className={`mt-8 p-6 rounded-2xl text-xs font-normal animate-in slide-in-from-top-2 ${
            result.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
            result.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700'
          }`}>
            <div className="flex items-center gap-2 mb-2">
               <span className="text-lg">{result.type === 'success' ? '✓' : '⚠'}</span>
               <p className="text-sm">{result.text}</p>
            </div>
            {result.raw && (
              <pre className="mt-4 p-4 bg-white/50 rounded-xl overflow-auto max-h-40 text-[10px] font-mono border border-white">
                {result.raw}
              </pre>
            )}
          </div>
        )}

        {preview && (
          <div className="mt-8 space-y-6 animate-in slide-in-from-top-4 duration-300 border-t border-slate-100 pt-8">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl text-center">
                <div className="text-[9px] text-emerald-600 font-medium uppercase tracking-widest mb-1">Ready</div>
                <div className="text-2xl font-medium text-emerald-700">{preview.readyMatchesCount}</div>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl text-center">
                <div className="text-[9px] text-amber-600 font-medium uppercase tracking-widest mb-1">Skipped</div>
                <div className="text-2xl font-medium text-amber-700">{preview.skippedMatches.length}</div>
              </div>
              <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl text-center">
                <div className="text-[9px] text-rose-600 font-medium uppercase tracking-widest mb-1">Warnings</div>
                <div className="text-2xl font-medium text-rose-700">{preview.warnings.length}</div>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="space-y-2">
                {preview.warnings.map((w, i) => (
                  <div key={i} className="text-[10px] font-normal text-rose-600 bg-rose-50/50 px-3 py-2 rounded-lg border border-rose-100">⚠️ {w}</div>
                ))}
              </div>
            )}

            {preview.skippedMatches.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-[10px] font-medium text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors list-none flex items-center gap-2">
                  <svg className="h-4 w-4 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  Skipped Matches Details ({preview.skippedMatches.length})
                </summary>
                <div className="mt-4 space-y-2 max-h-48 overflow-auto custom-scrollbar pr-2">
                  {preview.skippedMatches.map((m, i) => (
                    <div key={i} className="text-[10px] font-normal text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="text-slate-950 mb-1">{m.teams}</div>
                      <div className="text-rose-500">{m.reason}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="space-y-4 pt-4">
               <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                  <div className="h-px flex-1 bg-slate-100" />
                  Technical Details
                  <div className="h-px flex-1 bg-slate-100" />
               </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-medium uppercase tracking-widest text-slate-400">PHP Array Equiv</label>
                  <button onClick={() => navigator.clipboard.writeText(toPhpString(preview.phpArray))} className="text-[9px] font-medium text-slate-600 hover:underline text-slate-600">Copy PHP</button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-200/50 text-[10px] rounded-2xl overflow-auto max-h-80 font-mono leading-relaxed scrollbar-hide">
                  {toPhpString(preview.phpArray)}
                </pre>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-medium uppercase tracking-widest text-slate-400">Serialized</label>
                    <button onClick={() => navigator.clipboard.writeText(preview.serialized)} className="text-[9px] font-medium text-slate-600 hover:underline text-slate-600">Copy</button>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 text-slate-500 text-[9px] rounded-xl font-mono break-all max-h-24 overflow-auto scrollbar-hide">
                    {preview.serialized}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-medium uppercase tracking-widest text-slate-400">Post Body</label>
                    <button onClick={() => navigator.clipboard.writeText(preview.postBody)} className="text-[9px] font-medium text-slate-600 hover:underline text-slate-600">Copy</button>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 text-slate-500 text-[9px] rounded-xl font-mono break-all max-h-24 overflow-auto scrollbar-hide">
                    {preview.postBody}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
