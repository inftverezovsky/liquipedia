'use client';

interface ExportPanelProps {
  tournamentId: string;
  disciplineSlug: string;
}

export default function ExportPanel({ tournamentId, disciplineSlug }: ExportPanelProps) {
  const triggerPreview = () => {
    window.dispatchEvent(new CustomEvent('trigger-admin-preview'));
  };

  const getExportUrl = (format: string, type: string = 'matches') => {
    return `/api/${disciplineSlug}/tournament/${tournamentId}/export?format=${format}${format === 'csv' ? `&type=${type}` : ''}`;
  };

  return (
    <section className="rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Экспорт данных</h2>
      <div className="grid grid-cols-3 gap-2">
        <a 
          href={getExportUrl('json')} 
          className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          JSON
        </a>
        <a 
          href={getExportUrl('csv')} 
          className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          CSV
        </a>
        <button 
          onClick={triggerPreview}
          className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          PHP
        </button>
      </div>
    </section>
  );
}
